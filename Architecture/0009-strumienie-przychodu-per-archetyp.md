# ADR 0009 — Strumienie przychodu per archetyp: copilot (seat) vs agent (interakcja)

- Status: Zaakceptowany
- Data: 2026-06-28
- Powiązane: ADR 0002 (jeden nośnik przychodu), ADR 0004 (walidacja: zastąp, nie dodawaj), ADR 0005 (EVC jako podstawa wyceny), ADR 0007 (cena z EVC per nośnik — odłożony outcome‑pricing)

## Kontekst

Na jednej platformie SaaS współistnieją dwa jakościowo różne tryby AI:

- **Copilot** (np. AI summaries) — uruchamiany przez **zalogowanego użytkownika** wewnątrz produktu.
  Zużycie ograniczone pojemnością człowieka (seat fizycznie nie wygeneruje więcej niż N podsumowań/mc).
  COGS niski i przewidywalny (tokeny per seat). Wartość = oszczędność czasu pracownika licencjobiorcy.
- **Agent autonomiczny** (np. obsługa zgłoszeń) — inicjowany **zewnętrznie przez klientów końcowych**,
  działa na poziomie API (reasoning, RAG, integracje). Zużycie skaluje się z ruchem zewnętrznym,
  niezależnie od liczby seatów licencjobiorcy. COGS wielokrotnie wyższy, modelowany per
  konwersacja/rezolucja. Wartość = zastąpienie kosztu osobowego (BPO), cena per rozwiązany ticket.

Dwa drivery → dwa **różne mianowniki** (seat vs interakcja) i dwie różne dynamiki **COGS** i **EVC**.

Stan obecny w silniku ([financial-math.ts](../src/lib/shared/financial-math.ts)):

- Archetyp jest już per‑usługa (`service_type: 'copilot' | 'agent'`), a silnik liczy koszty osobno
  (copilot: `seats × requests × cena`; agent: per interakcja + containment → labor savings,
  `agentTokenCosts`).
- Ale **przychód jest spłaszczany do jednej liczby `revenue`** i raportowany na jednym, seatowym
  mianowniku. Korytarz cenowy i „cena" liczą jedną wartość niezależnie od miksu.
- Monetyzacja agenta (`outcome`/`deflected`/`interactions`) jest **liczona, ale zbramkowana poza
  nośnikiem `cohort`** — w scenariuszu `incremental` nigdy nie trafia do przychodu
  (`if (carrierIncludesMonetization)` = `false` dla cohort). Wartość agenta wchodzi dziś wyłącznie jako
  **labor savings cash** doklejony do `revenue`.

Dwa napięcia do rozstrzygnięcia:

1. **Z ADR 0002 („jeden nośnik; nigdy dwa").** Reguła powstała, by zabić podwójne liczenie *tego
   samego* pieniądza (bug NPV 761 mln USD: uplift ARPU + opłata za plan + override monetyzacji jako trzy
   opisy jednego strumienia). Czy copilot + agent to złamanie tej zasady, czy dwa legalnie odrębne
   strumienie?
   To muszą być dwa legalne strumienie, ponieważ jest to podstawowa rynku - funkcje dzielą się na copilotowe i autonomiczno-platformowe. Musimy je rozróżniać.
2. **Labor savings vs cena (utajone ryzyko podwójnego liczenia).** Dziś agent wnosi wartość jako
   *cost‑avoided* (labor savings = korzyść licencjobiorcy). Ale w modelu platformowym, gdzie SaaS
   **nalicza** za agenta, przychodem SaaS jest **cena per rezolucja**, a oszczędność BPO to korzyść
   **klienta końcowego** (kotwica EVC uzasadniająca cenę), nie przychód SaaS. Zsumowanie obu jako
   przychodu SaaS byłoby nowym podwójnym liczeniem.

## Decyzja

1. **Doprecyzowanie ADR 0002: nośnik per klasa zdarzeń wartości.** „Jeden nośnik" zakazuje wielu
   opisów *tego samego* zdarzenia/pieniądza. Strumienie o **rozłącznych klasach zdarzeń i płatników**
   są odrębnymi produktami i **wolno je sumować**. Test rozłączności: czy oba strumienie rozliczają to
   samo zdarzenie wartości / tę samą populację?
   - Copilot: zdarzenie = praca seata licencjobiorcy; kotwica w produktywności.
   - Agent: zdarzenie = rozwiązanie sprawy klienta końcowego; kotwica w zastąpieniu BPO.
   Rozłączne → **scenariusz wielo‑strumieniowy**, sumowanie dozwolone. `validateRevenueIntegrity` nadal
   **blokuje** strumienie nakładające się na to samo zdarzenie.

2. **Mianowniki per archetyp.** Copilot raportowany **per seat/AI‑user**; agent **per
   interakcję/rezolucję**. Sherpa nie sprowadza ich do wspólnego mianownika — sztuczne uwspólnienie było
   źródłem błędu korytarza „Realized Price".

3. **Osobny COGS i osobny EVC per archetyp.**
   - COGS: copilot = tokeny/seat; agent = koszt per interakcja (+ failed‑deflection penalty).
   - EVC: copilot ← oszczędność czasu pracownika (stawka godz.); agent ← wartość per rozwiązany ticket
     (zastąpienie BPO). **Wprowadzamy wspólny input „wartość jednostkowa per outcome" (`v`)**, domykając
     odłożony w ADR 0007 outcome‑pricing (`price_per_outcome = capture × v`). Ten sam `v` zasila
     hybrydową wartość kredytu w ADR 0010 (Decyzja 1).

4. **Cena ≠ labor savings (rozstrzygnięcie napięcia 2).**
   - Strumień **monetyzowany** (agent z `MonetizationConfig` typu `outcome`): przychodem SaaS jest
     **cena** (per rezolucja); labor savings staje się **kotwicą EVC po stronie klienta** (uzasadnia
     cenę wg ADR 0005), a **nie** jest doliczany do przychodu SaaS.
   - Strumień **wewnętrznej deflekcji** (agent bez naliczania — SaaS deflektuje własne zgłoszenia):
     korzyścią jest labor savings (cost‑avoided), jak dziś.
   Konfiguracja monetyzacji usługi rozróżnia te przypadki; nigdy oba naraz dla jednego strumienia.

5. **Model unifikacji cennika — Podejścia A i B równolegle (oba v1).** Dwie alternatywne struktury
   cennika rozwijane równolegle; scenariusz wybiera jedną:
   - **A — dwuścieżkowy hybryd:** **seat‑plan** (copilot, `plans.base_price × seats`) + **opłata
     per‑resolution** (agent, monetyzacja `outcome`/`deflected`). Mapuje się wprost na istniejące prymitywy.
   - **B — wspólny portfel kredytów** (tier → pula → konwersja, burn‑rate np. 10 vs 300) — rozpisane w **ADR 0010**.
   Billing (A vs B) jest **ortogonalny** do strumieni: oba podejścia raportują dwie ekonomie per
   archetyp (Decyzja 3 + 6).

6. **Blended gross margin per strumień + guardraile.** Raportować marżę osobno:
   `(Rev_copilot − COGS_copilot)` i `(Rev_agent − COGS_agent)`, oraz blended `Σ(Rev−COGS) / ΣRev`.
   Progi (copilot ~75–80%, agent ~60–65%) jako **miękki sygnał** ryzyka „cloud‑invoice‑shock", nie
   twardy blok. **Źródło progów: globalne z override per scenariusz** (kaskada jak `gross_margin`:
   global → vertical → cohort).

7. **Sygnał miksu.** Wykrywać `driverProfile` scenariusza (`seat_only | interaction_only | mixed`) i
   przy `mixed` jawnie komunikować rozdział strumieni w UI. Realizuje wprost wymóg „Sherpa wie i
   pokazuje, że liczy dwie różne usługi".

## Konsekwencje

Pozytywne:

- Znika fałszywy wybór „albo podwójne liczenie (ADR 0002), albo gubienie wartości agenta" — dwa
  rozłączne strumienie modelowane uczciwie.
- Korytarz cenowy i „cena" stają się **per‑archetyp**, co rozwiązuje pierwotny problem „Realized Price"
  u źródła, zamiast łatać jedną zblendowaną liczbę.
- Domyka odłożony follow‑up z ADR 0007 (outcome‑pricing) i eliminuje utajone ryzyko podwójnego liczenia
  cena‑vs‑labor‑savings.
- CFO‑grade widok blended margin chroni bilans przed „szokiem rachunku za chmurę".

Negatywne / koszty:

- Silnik musi śledzić przychód i COGS **per strumień** na `MonthlyBreakdown` (dziś wyodrębniony jest
  tylko `agentTokenCosts`).
- Poluzowanie walidacji „jeden nośnik" jest delikatne — musi nadal blokować nakładanie się strumieni na
  to samo zdarzenie. Wymaga nowego testu rozłączności.
- Więcej stanu w wyniku i więcej złożoności w UI (dwie ekonomie zamiast jednej).
- **Ograniczenie (ślepy punkt guardraila):** W scenariuszu typu `mixed`, jeśli wartość copilota jest niesiona wyłącznie przez ARPU uplift kohorty (brak dedykowanego planu seatów lub monetyzacji outcome dla copilota), przychód copilota (`copilotRevenue`) wynosi `0`. W konsekwencji `copilot stream margin = null`, co powoduje, że próg marży dla copilota (np. 78%) nigdy nie zadziała (guardrail jest wtedy ślepy na tę część miksu). Jest to spójne z założeniem, że uplift kohorty to nie jest bezpośrednio billowany strumień copilota.

Parametry (ustalone 2026-06-28):

- **Capture = `target`** (baza EVC→cena z ADR 0007); pasmo upper/lower raportowane per strumień jak
  reszta KPI Sherpy.
- **Progi marży**: copilot 75–80%, agent 60–65%; **globalne z override per scenariusz** (kaskada jak
  `gross_margin`).
- **Hybrid fee/overage**: abonament pokrywa `target`, overage z narzutem (> 1×) — stawka w ADR 0010.
