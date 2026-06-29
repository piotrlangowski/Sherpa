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
