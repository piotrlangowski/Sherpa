# ADR 0012 — Abonament z wliczonym limitem: pula jako nośnik per-member + jawna nadwyżka

- Status: Zaakceptowany
- Data: 2026-07-02
- Powiązane: ADR 0002 (jeden nośnik przychodu), ADR 0009 (strumienie per archetyp), ADR 0010 (wspólny portfel kredytów)

## Kontekst

Test na żywym scenariuszu — Claude Fable 5 pod polityką Anthropic z 1 lipca 2026 (Pro $20/mies., Fable wliczony do 50% tygodniowego limitu, reszta [nadwyżka Fable + Sonnet] rozliczana czysto zużyciowo po realnych stawkach API, bez marży na kredytach) — pokazał, że żaden istniejący nośnik nie wyraża tego wprost:

- `plan` liczy `base_price × seats` (ADR 0002; `financial-math.ts:1647-1668`), ale nie ma pojęcia "X kredytów wliczonych w cenę", więc allowance trzeba by zaszyć osobno per usługę (monetyzacja `hybrid`), tracąc wspólną pulę między usługami.
- `pool` (ADR 0010) ma dokładnie potrzebne pojęcie — tier fee + wspólna pula + burn-rate per usługa + nadwyżka — ale ujawnia trzy luki dopiero przy próbie odtworzenia tego konkretnego, realnego cennika:
  1. **Opłata tieru jest płaska**, nie × liczba subskrybentów (`financial-math.ts:2077`: `upperRevenue += tier.monthly_fee + overageRevenueUpper` — raz na miesiąc, niezależnie od `aiUsers`). Dla produktu subskrypcyjnego (miliony subskrybentów Pro) to nie jest błąd zaokrąglenia, tylko rząd wielkości.
  2. **Usługi spoza puli w scenariuszu z nośnikiem `pool` nie księgują przychodu w ogóle** — `carrierIncludesMonetization` (`financial-math.ts:1634`) obejmuje `plan|feature|pack`, nie `pool`. Koszt tokenów takiej usługi i tak się nalicza (sekcja "A. Direct AI Services Costs", `financial-math.ts:1726`, działa dla każdej usługi w scenariuszu niezależnie od carriera) — więc usługa spoza puli w scenariuszu `pool` to dziś czysty koszt bez przychodu, nie neutralny "brak modelowania".
  3. Cena nadwyżki poola jest **wyprowadzona**, nie ustawialna wprost: `wartość_kredytu = max(floor_kosztowy, capture × EVC/kredyt)` (ADR 0010 Decyzja 1). Dla *tego* scenariusza to akurat działa poprawnie — zostawienie EVC pustym daje floor = koszt, czyli dokładnie żądany pass-through bez marży — ale nie ma sposobu ustawić nadwyżkę na cenę inną niż zblendowany koszt rzeczywisty (np. jawny narzut, albo okrągła cena cennikowa).

Rozważano dodanie **osobnego** mechanizmu "plan z wliczonym limitem" (`plan.included_credits_per_seat`) obok istniejącej puli. Odrzucono: różniłby się od `pool` wyłącznie tym, że nalicza opłatę × seats zamiast płasko — czyli dokładnie luka (1) powyżej. Utrzymywanie dwóch nośników rozwiązujących ten sam problem biznesowy ("abonament + wliczony limit + PAYG") powtórzyłoby błąd, który ADR 0001–0004 już raz naprawiły (trzy równoległe źródła przychodu bez wspólnego mianownika). Zamiast tego niniejszy ADR **parametryzuje `pool`**, żeby natywnie pokrywał też przypadek subskrypcyjny.

## Decyzja

1. **Nowe pole `PoolTier.fee_basis: 'flat' | 'per_member'`** (domyślnie `'flat'`, zachowuje dzisiejsze zachowanie dla istniejących tierów Copilot Pro/Pro+/Business/Enterprise w tym workspace). Przy `'per_member'` opłata tieru liczy się jako `monthly_fee × aiUsers` tego miesiąca (ta sama baza co monetyzacja `usage`/`hybrid` per-usługę: `calculateMonetizationRevenue`), zamiast płasko raz na miesiąc.

2. **`carrierIncludesMonetization` obejmuje też `pool`.** Usługi podłączone do scenariusza z nośnikiem `pool`, ale NIE wpisane do tabeli burn-rate danego tieru, księgują przychód przez istniejącą ścieżkę `calculateMonetizationRevenue` — tak jak dziś działa dla `plan`. Inwariant jednorodności billingu (ADR 0010 Decyzja 4, `validateRevenueIntegrity`) dalej pilnuje **tylko** usług w puli; usługi poza pulą podlegają zwykłym regułom (jak dziś dla `plan`/`feature`/`pack`).

3. **Cena nadwyżki poola zostaje wyprowadzona (ADR 0010 Decyzja 1), bez zmian formuły.** Dla scenariuszy chcących czystego pass-through (jak Fable 5: "$1 kredyt = $1 kosztu, marża z abonamentu") wystarczy zostawić `capture`/EVC puste — floor kosztowy już daje właściwy wynik. Jawny override ceny nadwyżki jest odłożony (patrz Otwarte pytania, Q3).

4. **Sublimity per usługa w puli są odłożone.** Scenariusz "Fable ≤ 50% limitu" modeluje się dziś przez trzymanie w puli WYŁĄCZNIE usługi Fable (`credit_pool_size` = allowance), a reszty pracy jako usług poza pulą (dzięki Decyzji 2 powyżej ich przychód też się liczy). To pokrywa realny przypadek bez nowego pola.

## Konsekwencje

Pozytywne:
- Jeden nośnik (`pool`) pokrywa zarówno dzisiejszy przypadek B2B (Copilot Enterprise: opłata per-organizację) jak i subskrypcyjny B2C (Pro: opłata per-subskrybenta) — bez duplikowania mechanizmu.
- Usługa spoza puli przestaje być "kosztem-widmo" — jej COGS i przychód znów są sparowane, jak wszędzie indziej w silniku.
- Realny scenariusz Fable 5 (JSON z 2026-07-02) staje się wyrażalny bez ostrzeżeń i obejść.

Negatywne / koszty:
- `fee_basis` to nowa kolumna + migracja (`pool_tiers.fee_basis`), plus UI (`PoolForm.svelte`) i MCP (`pool_tier_action`) do zaktualizowania.
- Rozszerzenie inwariantu jednorodności billingu (Decyzja 2) na "usługi poza pulą" wymaga jasnego rozróżnienia w UI/MCP między "usługa w puli" a "usługa w tym samym scenariuszu, ale poza pulą" — dziś to rozróżnienie istnieje tylko przez obecność w `pool_burn_rates`.
- Nie rozwiązuje luki #5 z analizy Fable 5 (statyczne `seats` planu vs dynamiczna baza kohorty) — to osobny, przedistniejący problem `plan`, nie wprowadzony przez ten ADR.

Parametry (ustalone 2026-07-02):

- **Q1 — baza `per_member` = aktywni użytkownicy AI kohorty (dynamiczne, `aiUsers`)**, nie statyczne `seats`. Spójne z tym, jak COGS i PAYG już dziś liczą się dynamicznie po krzywej `ai_adoption_rate`/churn/akwizycji — opłata abonamentowa ma podążać za tą samą bazą, nie za zamrożonym polem `seats` (luka #5 z analizy Fable 5 pozostaje wyłącznie problemem `plan`, świadomie nie dziedziczona przez `pool`).
- **Q2 — Decyzja 2 wdrażana teraz.** Usługi spoza tabeli burn-rate w scenariuszu `pool` księgują przychód przez `calculateMonetizationRevenue`, tak jak dziś `plan`/`feature`/`pack`. To odblokowuje wzorzec "tylko Fable w puli, Sonnet obok" bez czekania na sublimity (Q4).
- **Q3 — jawna `overage_price_per_credit` odłożona.** Floor kosztowy + EVC z ADR 0010 Decyzja 1 zostaje jedynym mechanizmem cenowym nadwyżki; z pustym EVC już dziś poprawnie daje pass-through bez marży.
- **Q4 — sublimity per usługa w puli odłożone (YAGNI).** Do czasu realnego przypadku z >1 usługą w jednej puli i nierównym podziałem limitu.
