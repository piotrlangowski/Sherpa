# ADR 0003 — Override monetyzacji tylko na nośniku przychodu

- Status: Zaakceptowany
- Data: 2026-06-20
- Powiązane: ADR 0001 (typy modelowania), ADR 0002 (nośnik przychodu), ADR 0004 (walidacja), ADR 0005 (EVC jako podstawa wyceny)

## Kontekst

Sherpa pozwala dziś nadpisać model monetyzacji (`monetization_type`: none / addon / usage / hybrid, wraz z politykami overcharge, credit packs itd.) na poziomie scenariusza, niezależnie dla service, pack i plan (ekran "Service, Provider & Plan Overrides"). Funkcja jest użytkowo wartościowa — pozwala testować modele cenowe bez modyfikowania współdzielonego katalogu.

Problem: override monetyzacji ma inną rolę i inne ryzyko w każdym z trzech typów modelowania (ADR 0001). W szczególności w typie a (incremental) override usage/addon dolicza opłatę za to samo, co już siedzi w `arpu_uplift` — co tworzy podwójne liczenie.

Ogólny wzorzec: override monetyzacji jest bezpieczny, gdy **zastępuje** istniejący nośnik przychodu, a niebezpieczny, gdy **dodaje się** do niego.

Rozważano dwa warianty:
- Wariant 1 — typ a dopuszcza pełny override monetyzacji (a i c współdzielą mechanizm).
- Wariant 2 — typ a jest celowo uproszczony (monetyzacja = wyłącznie uplift ARPU); pełny override żyje w b i c.

Wybrano Wariant 2. Uzasadnienie: c jest pierwotnym i najbogatszym domem złożoności monetyzacji; wartość typu a leży w czułości na zachowanie (churn/retencja/ARPU), gdzie panel pricingu jest rozpraszający; asymetria rozszerzania jest korzystna (Wariant 2 → 1 to bezpieczne rozszerzenie, 1 → 2 to regresja odbierająca funkcję); użytkownik typu a jest na razie hipotezą, więc przedwczesne dodawanie pełnej monetyzacji to nieuzasadniona złożoność (Sherpa jest projektem portfolio — ceniona jest klarowność, nie liczba funkcji).

## Decyzja

Override monetyzacji jest dostępny **wyłącznie na poziomie, który jest nośnikiem przychodu** w danym typie (ADR 0002). Na pozostałych poziomach monetyzacja jest wyszarzona albo działa wyłącznie jako koszt.

Zachowanie per typ:

### Typ a — incremental / cohort uplift
- Monetyzacja = **wyłącznie `arpu_uplift`** (płaski lub procentowy). Brak addon / usage / hybrid.
- Override musi **zastępować** uplift, nigdy się z nim sumować.
- Tryb celowo prosty ("szybki tryb" — popatrz na bazę i jej zachowanie).

### Typ b — bottom-up / GTM revenue
- Monetyzacja jest **rdzeniem modelu** — to jej właśnie dotyczy pytanie.
- Pełny override (addon / usage / hybrid) jest tu na miejscu: porównujesz modele cenowe tego samego produktu.
- Warunek: seats zakotwiczone w realnym rynku; override zmienia *jak* liczysz cenę, nie *ile* jest klientów.

### Typ c — investment appraisal
- Monetyzacja określa **stronę korzyści** równania NPV.
- Pełny override jest legalny i cenny (np. "czy model usage zwraca CAPEX szybciej niż addon?"), ale musi zasilać jeden strumień przyrostowy, nie sumować się z innym źródłem.

### Komunikat w UI
Ponieważ typ a jest świadomie płytszy niż reszta narzędzia, interfejs musi to jawnie zakomunikować (np. "tryb szybki — przełącz na «czy opłaca się zbudować» dla pełnego modelu cenowego"), aby użytkownik nie odebrał braku pricingu jako ograniczenia narzędzia.

## Konsekwencje

Pozytywne:
- Typ a pozostaje 30-sekundowym narzędziem bez żargonu monetyzacyjnego.
- Trzy typy mają jasne, rozłączne role; łatwiej tłumaczyć i walidować.
- Override przestaje być "niezależny na każdym poziomie" i staje się "na nośniku wynikającym z typu" — to naprawia podwójne liczenie, zachowując wartość funkcji w b i c.
- Droga rozszerzenia (dodać monetyzację do a) pozostaje otwarta i bezpieczna.

Negatywne / koszty:
- Duplikacja UX: mechanizm override istnieje w b i c, nie w a; użytkownik musi wiedzieć, że testowanie cen wymaga zmiany typu.
- Przejście a → c jest skokiem (zmiana typu), nie płynnym dodaniem pola.
- Wymaga jawnego komunikatu w UI, by uniknąć dysonansu "narzędzie wszędzie głębokie, tu nagle płytkie".

Otwarte (do rewizji przy danych):
- Jeśli pojawi się twardy sygnał, że użytkownicy zaczynają od bazy klientów i chcą testować pricing od razu na niej — zrewidować na rzecz Wariantu 1 (rozszerzyć a o pełną monetyzację).
