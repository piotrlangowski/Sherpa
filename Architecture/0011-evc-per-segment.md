# ADR 0011 — EVC per-segment (różnicowanie sufitu wartości i COGS per cohort)

- Status: Zaakceptowany
- Data: 2026-06-29
- Powiązane: ADR 0005 (EVC), ADR 0009 (strumienie przychodu per archetyp)

## Kontekst

Dotychczas w kalkulatorze ROI wizualizacja **Pricing Corridor** (`COGS Floor → Price → EVC Ceiling`) pokazywała płaski sufit wartości EVC dla wszystkich segmentów (cohorts) w ramach jednego scenariusza. Sufit EVC był liczony z trzech globalnych skalarów scenariusza (`evc_nba_annual_value`, `evc_extra_positive_value`, `evc_negative_value`), przez co różnicowanie per-segment dotyczyło wyłącznie COGS.

W rzeczywistości różne segmenty klientów wykazują różną aktywność w użyciu narzędzi AI, co przekłada się zarówno na wyższą wartość (EVC), jak i wyższe koszty infrastruktury (COGS). Sama aktywność globalna (`avg_requests_per_user_month` przypisana do usługi) bez lewara per-segment dawała płaski sufit.

## Decyzje

1. **Różnicowanie wartości per-segment (cohort):** Sufit EVC, cena docelowa (target) oraz podłoga (floor) EVC są obliczane indywidualnie dla każdego segmentu na podstawie jego specyficznego profilu użycia.
2. **Mnożnik intensywności użycia (`usage_intensity`):** Wprowadzono do konfiguracji kohort pole `usage_intensity REAL DEFAULT 1.0`. Skaluje ono aktywność bazową usług:
   - Dla usług typu **copilot**: `activity(s, c) = avg_requests_per_user_month(s) × usage_intensity(c)`
   - Dla usług typu **agent**: `activity(s, c) = deflected_outcomes(s) × usage_intensity(c)`
3. **Wpływ na COGS:** Intensywność użycia bezpośrednio skaluje rzeczywiste zużycie tokenów w timeline: `weightedAiUsers += cohortAiUsers × usage_intensity(c)`. Z tego ważonego wskaźnika liczone są koszty tokenów (COGS) i zużycie kredytów w credit pool. Headline adoption (liczba użytkowników) pozostaje na nieważonym `activeAiUsers`.
4. **Anty-double-count (agent × labor):** Dla usług typu `agent` z ustawionym `value_per_outcome` wartość EVC jest liczona z tej wartości jednostkowej i wyłącza labor savings dla tej usługi (spójność z ADR 0009). Usługi bez `value_per_outcome` korzystają z tradycyjnej ścieżki labor savings.
5. **Wsteczna zgodność (Opt-in):** Jeśli żadna usługa w scenariuszu nie ma zdefiniowanego `value_per_outcome`, silnik stosuje dotychczasowy płaski sufit wyliczany ze skalarów scenariusza.

## Formuły

Miesięcznie per-cohort `c`, per-user:
```
activity(s, c)       = baseActivity(s) × usage_intensity(c)
valueFromOutcomes(c) = Σ_s  value_per_outcome(s) × activity(s, c)

netValue(c)          = valueFromOutcomes(c) + laborSavingsMonthly(c) − evc_negative_value / 12

ceiling(c) = referenceValue + evc_capture_ceiling_pct × netValue(c)
target(c)  = referenceValue + evc_capture_target_pct  × netValue(c)
floor(c)   = referenceValue + evc_capture_floor_pct   × netValue(c)

cogs(c)    = ai_adoption_rate(c) × usage_intensity(c) × u_base + o
```

## Konsekwencje

Pozytywne:
- Pricing Corridor precyzyjnie pokazuje "ile wartości tworzymy dla kogo" (np. Enterprise generuje znacznie wyższy sufit wartości przy wyższym COGS).
- Prawdziwe odzwierciedlenie obciążenia kosztami tokenów w NPV w zależności od intensywności użycia danej kohorty.

Negatywne:
- Wymagana ostrożność przy kalibracji `usage_intensity`, aby nie zawyżyć sztucznie wartości EVC bez pokrycia w cenie.

## Rozszerzenie (Track A, 2026-07-01): mnożniki EVC per-kohorta i kohorta referencyjna

Kontekst: Decyzja 5 (wsteczna zgodność/opt-in) oznaczała, że scenariusz **bez** `value_per_outcome`
nadal dostawał płaski sufit EVC liczony ze skalarów scenariusza — różnicowanie per-segment
dotyczyło wtedy wyłącznie COGS (Decyzja 2/3), nie wartości. Ta luka jest realnym problemem dla
zwykłych scenariuszy Copilot (bez outcome-pricing), gdzie `base_arpu`/`usage_intensity` różnią się
mocno między kohortami, a sufit EVC i tak jest identyczny dla wszystkich.

Odrzucony alternatywny projekt: pojedynczy mnożnik blankietowy (`evc_value_multiplier`) na
`CohortConfig` — konfliktuje driversy wartości (willingness-to-pay vs. koszt osobowy zastąpiony),
które skalują się różnie i czasem nie-monotonicznie z wielkością segmentu. Zamiast tego:

6. **Kohorta referencyjna.** Nowe pole `scenarios.evc_reference_cohort_id` (nullable). Istniejące
   skalarne inputy EVC scenariusza (`evc_nba_annual_value`, `evc_extra_positive_value`,
   `evc_negative_value`) są odtąd rozumiane jako opisujące **tę konkretną kohortę**, nie abstrakcyjny
   blend. `null` zachowuje płaski sufit sprzed zmiany (pełna wsteczna zgodność).
7. **Trzy rozłożone mnożniki, nie jeden.** Per kohorta, względem kohorty referencyjnej, przez
   istniejącą kaskadę override'ów (`scenario_scope_overrides`, `all_clients → vertical → cohort`):
   `evc_extra_value_multiplier` (skaluje `extraPositiveValue` — produktywność/oszczędność czasu,
   rośnie z pensją i głębokością użycia), `evc_negative_value_multiplier` (skaluje `negativeValue`
   — koszt przełączenia/tarcie organizacyjne, rośnie ze złożonością organizacji, nie z użyciem),
   `evc_nba_multiplier` (skaluje `nbaAnnualValue`; domyślnie 1.0, zaawansowane/opcjonalne — cena
   konkurencyjna per seat rzadko mocno różni się per segment dla Copilota). Domyślnie `1.0`
   (brak różnicowania) gdy nic w kaskadzie nie ustawiło wartości.
8. **Sugerowany domyślny mnożnik (nie ślepe zgadywanie).** `suggestEvcMultipliers` zwraca
   data-derived sugestię dla `evc_extra_value_multiplier`:
   `sqrt((cohort.base_arpu / ref.base_arpu) × (cohort.usage_intensity / ref.usage_intensity))`.
   `evc_negative_value_multiplier`/`evc_nba_multiplier` nie mają wiarygodnej auto-derywacji —
   pozostają `1.0` z tekstem podpowiedzi (np. "większe organizacje zwykle mają wyższe tarcie
   migracji/compliance").
9. **Priorytet ścieżek w `buildPricingCorridor`.** Kolejność: (1) `hasAnyValuePerOutcome` — ścieżka
   per-outcome z Decyzji 1–4 powyżej (najwyższy priorytet, bez zmian); (2) **nowa** ścieżka
   mnożnikowa — aktywna gdy którakolwiek kohorta ma mnożnik ≠ 1.0; (3) płaski fallback skalarny
   scenariusza (bez zmian, gdy żadna z powyższych nie jest skonfigurowana). Termin labor-savings
   pozostaje celowo bez mnożnika — mnożniki skalują inputy willingness-to-pay, nie zastąpiony koszt
   osobowy (to domena ADR 0009 Track B).
10. **Guardraile (walidacja niedestrukcyjna, `warn`).** Kohorta referencyjna z własnym mnożnikiem
    ≠ 1.0 → sprzeczność (jest 1.0 względem samej siebie z definicji). Mnożnik ustawiony bez
    `evc_reference_cohort_id` → ostrzeżenie o niezdefiniowanej bazie odniesienia.

Konsekwencje (Track A): Pricing Corridor różnicuje sufit EVC dla zwykłych scenariuszy Copilot bez
konieczności konfigurowania `value_per_outcome`; UI oznacza kohortę referencyjną wizualnie (★,
przerywana linia łącząca), żeby było jasne, dlaczego pozostałe słupki od niej odbiegają.

## Aneks: Corridor Precision Pass (2026-07-02)
1. **Per-cohort price rung:** W przypadku gdy `revenue_carrier` resolves to `'cohort'`, wykres Pricing Corridor renderuje rzeczywistą cenę per kohorta (`pricePerCustomer`), zamiast ogólnoscenariuszowej średniej ważonej (`actualPrice`).
2. **Transparency on EVC Multipliers:** Sugestia `suggestEvcMultipliers` zwraca dodatkowe pola `arpuRatio` oraz `intensityRatio`, pokazujące rozbicie składowych wzoru sugerowanego mnożnika. Ostrzeżenie (ATP proxy caveat) jest prezentowane w opisach i odpowiedziach MCP: `base_arpu` reprezentuje obecną cenę (endogeniczne przybliżenie zdolności do zapłaty / ATP), a sugestie są punktem startowym (prior), a nie bezpośrednim dowodem na gotowość do zapłaty (WTP).
