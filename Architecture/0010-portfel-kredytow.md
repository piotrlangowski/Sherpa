# ADR 0010 — Wspólny portfel kredytów (Podejście B): tier → pula → konwersja

- Status: Zaakceptowany
- Data: 2026-06-28
- Powiązane: ADR 0002 (jeden nośnik), ADR 0005 (EVC jako podstawa wyceny), ADR 0007 (cena z EVC per nośnik — usage jako cost‑plus/benchmark), ADR 0009 (strumienie per archetyp)

## Kontekst

ADR 0009 ustala dwa rozłączne strumienie (copilot seatowy + agent interakcyjny) i rozwija
**Podejścia A i B równolegle (oba v1)**: A = dwuścieżkowy hybryd (seat‑plan + opłata per‑resolution),
B = niniejszy ADR. Billing (A vs B) jest ortogonalny do strumieni — scenariusz wybiera jedną strukturę.

Podejście B (Bain — „Unified Credit Ledger"): klient kupuje **tier** (np. Gold $2000/mc) zawierający
**pulę** uniwersalnych kredytów (np. 100 000). Obie aktywności palą z **tej samej puli** wg różnych
**burn‑rate'ów** (summary = 10, rezolucja agenta = 300). Cel: ukryć przed klientem złożoność
techniczną (tokeny, API, GPU) i dać przewidywalność budżetową cenioną przez Procurement; CFO
dopasowuje wartość kredytu do COGS.

Problem do rozstrzygnięcia: jedna pula i jedna cena tieru obsługują **dwa** strumienie ADR 0009.
Trzeba ustalić: (1) czym jest kredyt, (2) jak rozpoznawać przychód z przedpłaconego tieru, (3) jak
rozbić jedną cenę na dwie ekonomie strumieni, (4) co przy wyczerpaniu puli.

## Decyzja

1. **Wartość kredytu = hybryda: floor kosztowy + narzut wartości.**
   `wartość_kredytu = max(koszt_tokenów, capture × wartość_jednostkowa)`.
   - Koszt tokenów (istniejące `input_tokens_per_credit` / `output_tokens_per_credit`) jest **podłogą**
     chroniącą marżę — kredyt nigdy nie kosztuje mniej niż COGS.
   - Powyżej podłogi cenę napędza **wartość jednostkowa `v`** (`capture × v`), zgodnie z EVC (ADR 0005);
     `v` to **wspólny, zatwierdzony input** „wartość per outcome/aktywność" wprowadzany w ADR 0009 (Decyzja 3).
   Burn‑rate'y (10 vs 300) wyrażają tę hybrydę: rezolucja pali 300, bo `max(jej koszt tokenów, jej
   wartość×capture)` ≈ 30× kredytu summary. Spójne z ADR 0007: usage/credit zostaje cost‑plus w
   podłodze, EVC steruje narzutem.

2. **Rozpoznanie przychodu = subskrypcja tieru (z breakage).** Cały fee tieru (np. $2000/mc) jest
   przychodem w danym miesiącu **niezależnie od zużycia**. Niewykorzystane kredyty = **breakage**
   (dodatkowa marża), nie zobowiązanie odroczone. Pula zachowuje się jak nośnik `addon` (płaski
   abonament) — przewidywalny timeline/NPV, zgodny z duchem ADR 0002 (jeden, jasny nośnik: tier).

3. **Atrybucja do strumieni = wg EVC, nie spalonych kredytów.** Cenę tieru dzielimy między copilot i
   agent **proporcjonalnie do EVC per strumień** (per‑archetyp EVC z ADR 0009), a nie wg udziału w
   spalonych kredytach.
   **Zasada nadrzędna: strumień (atrybucja wartości) i billing (sposób naliczania) to dwie ortogonalne
   warstwy.** Podejście B unifikuje *billing* (jedna pula, jedna cena), ale raportowanie wciąż pokazuje
   *dwie ekonomie* — przez EVC. To godzi pulę z ADR 0009 bez powrotu do jednej zblendowanej liczby.
   Burn‑rate'y nadal służą do liczenia COGS i breakage, nie do dzielenia przychodu.

4. **Wyczerpanie puli = wg billing modelu usługi.** Zachowanie po wyczerpaniu wynika z
   `MonetizationType` (`none|addon|usage|hybrid|outcome`), nie z osobnego pokrętła:
   - `addon` → twardy cap + breakage (czysta subskrypcja),
   - `hybrid` → abonament pokrywa `target`, overage powyżej puli **z narzutem (> 1×, np. 1.3×)**,
   - `usage` → konsumpcja (rozliczenie per kredyt).
   **Inwariant jednorodności billingu:** w jednym scenariuszu z pulą **nie wolno mieszać** usług o
   różnych `monetization_type`. Wspólny portfel ma sens tylko, gdy wszystkie usługi bilingują tak samo.
   Egzekwować przy dodawaniu usług w wizardzie i w `validateRevenueIntegrity`.

5. **Model danych = nowy nośnik `pool`.** Tier+pula to **osobny typ** w `MonetizationType`/carrier
   (cena tieru, pula kredytów, tabela burn‑rate per usługa, `capture = target`), nie przeciążony
   `addon`. Rozpoznanie przychodu zachowuje się jak `addon` (Decyzja 2), ale pojęciowo i schematowo to
   odrębny nośnik — czystsze dla walidacji jednorodności billingu (Decyzja 4) oraz MCP/UI.

## Konsekwencje

Pozytywne:

- Przewidywalność budżetowa (stały tier) + ochrona marży (kredyt z podłogą kosztową) — dokładnie cel
  modelu Baina.
- Pula nie łamie ADR 0009: dwie ekonomie nadal raportowane przez EVC (warstwy ortogonalne).
- Breakage jawnie modelowany jako marża, nie ukryty.
- Reużycie istniejących prymitywów: `input_tokens_per_credit`, `price_per_credit`, `MonetizationType`.

Negatywne / koszty:

- Nowy model danych „tier → pula → tabela burn‑rate per usługa" (encja tieru + pula + konwersje).
- Inwariant jednorodności billingu wymaga walidacji w wizardzie i w silniku (nowa reguła).
- Atrybucja wg EVC wymaga, by per‑strumień EVC z ADR 0009 był policzony, zanim podzieli się tier.
- Hybryda wartości kredytu (`max(koszt, v×capture)`) wymaga **wspólnego inputu `v`** „wartość per
  outcome/aktywność" — zatwierdzony, współdzielony z ADR 0009 (do zbudowania).

Parametry (ustalone 2026-06-28):

- **Capture = `target`** (baza EVC→cena z ADR 0007) w `wartość_kredytu` i w atrybucji strumieni.
- **Overage `hybrid`**: abonament pokrywa `target`, overage z **narzutem > 1×** (np. 1.3×). **Breakage
  bez rollover** — niewykorzystane kredyty przepadają (= marża, Decyzja 2).
- **Model danych = osobny nośnik `pool`** (nie przeciążony `addon`) — Decyzja 5.
