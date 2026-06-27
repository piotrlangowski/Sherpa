# ADR 0002 — Jeden nośnik przychodu na typ modelowania

- Status: Zaakceptowany
- Data: 2026-06-20
- Powiązane: ADR 0001 (typy modelowania), ADR 0003 (override monetyzacji), ADR 0004 (walidacja), ADR 0005 (EVC jako podstawa wyceny)

## Kontekst

ADR 0001 ustala trzy typy modelowania. Pozostaje rozstrzygnąć, **który poziom (plan / pack / feature / kohorta) generuje przychód** w każdym typie, a jaką rolę pełnią pozostałe poziomy. Obecnie ekran kroku 3 ("Map services and pricing offerings") pozwala zaznaczyć plan, pack i feature jednocześnie i niezależnie, przy czym każdy z nich dokłada przychód. To jest mechaniczne źródło podwójnego liczenia opisanego w ADR 0001.

Intuicja produktowa (potwierdzona w analizie): tylko jeden poziom powinien być nośnikiem przychodu. Pozostałe poziomy są albo **kosztem dostarczenia** (cost-to-serve), albo **kontekstem-ograniczeniem**, w którym nośnik się porusza.

## Decyzja

W każdym typie modelowania dokładnie jeden poziom jest **nośnikiem przychodu**. Wybór typu (ADR 0001) jednoznacznie ten poziom wyznacza. Pozostałe poziomy schodzą do roli służebnej:

### Typ a — incremental / cohort uplift
- Nośnik przychodu: **kohorta** (ARPU × liczebność, z upliftem).
- Plan / pack / feature: **kanały dostarczenia** — wpływają na ARPU/churn, nie dokładają osobnego strumienia.
- Liczy się delta zachowania kohorty, nie poziom bezwzględny.

### Typ b — bottom-up / GTM revenue
- Nośnik przychodu: **plan** (seats × cena).
- Kohorty: **segmenty seatów** (poziom niżej, uszczegółowienie popytu).
- Feature / pack: **koszt-to-serve** — obniżają marżę planu o koszt tokenów/FTE.

### Typ c — investment appraisal / capital budgeting
- Nośnik przychodu: **strumień przyrostowy korzyści** (uplift kohorty lub przychód z monetyzacji feature), zestawiony z nakładem (CAPEX) i zdyskontowany.
- Plan / pack: **kontekst-ograniczenie** (hierarchia zawierania: feature ⊂ pack ⊂ plan). Feature dziedziczy kontekst rodzica i może go tylko obciążyć kosztem albo uzasadnić wyższą cenę.

### Zasada nadrzędna
Tylko jeden poziom generuje przychód. Reszta albo go modyfikuje (delta), albo go obciąża (koszt). Nigdy dwa nośniki naraz w jednym scenariuszu.

### Ekspansja poza kohortę
Jeśli plan celuje w klientów spoza istniejącej kohorty, modeluje się to jako **osobną kohortę** w scenariuszu, a nie jako wolne pole `seats` doklejone do planu. Dzięki temu `seats` zawsze odnoszą się do realnej populacji.

## Konsekwencje

Pozytywne:
- Jednoznaczne przypisanie ról eliminuje podwójne liczenie u źródła.
- Ekran kroku 3 może pokazywać poziomy w roli wynikającej z typu (nośnik vs. koszt vs. kontekst), zamiast trzech równorzędnych checkboxów.
- `seats` przestają być wolną liczbą — są zakotwiczone w kohorcie (segment) albo w osobnej kohorcie (ekspansja).

Negatywne / koszty:
- Wymaga przeprojektowania ekranu kroku 3 i logiki liczenia przychodu, tak by zależała od typu.
- Koncepcja "plan jako osobna kohorta" wymaga wsparcia w modelu danych (wiele kohort na scenariusz powiązanych z planem).

Wymaga dalszych decyzji:
- Zachowanie override monetyzacji na nośniku i poza nim → ADR 0003.
- Twarda reguła egzekwująca jeden nośnik → ADR 0004.
