# ADR 0001 — Trzy typy modelowania scenariusza

- Status: Zaakceptowany
- Data: 2026-06-20
- Powiązane: ADR 0002 (nośnik przychodu), ADR 0003 (override monetyzacji), ADR 0004 (walidacja "zastąp, nie dodawaj")

## Kontekst

Sherpa pozwala w jednym scenariuszu jednocześnie aktywować plan (seats × cena), feature pack oraz pojedynczą usługę AI, a `revenue_source: "both"` sumuje strumień kohortowy i strumień planowy. Te dwa strumienie nie mają wspólnego mianownika: `seats` jest wolnym polem liczbowym, niezwiązanym z liczebnością kohorty. W efekcie scenariusz "AI Agent" przy kohorcie 1000 klientów i planie na 200 000 seatów dał NPV rzędu 761 mln USD i profitability index ~7525 — wartości nierealistyczne, będące artefaktem sumowania trzech opisów tego samego pieniądza (uplift ARPU kohorty + opłata za plan + potencjalny override monetyzacji).

Źródłem problemu jest brak jawnie wybranej **jednostki rozliczeniowej** (unit of analysis). Model pozwala traktować plan, pack i feature jako trzy równoległe, niezależne źródła przychodu, podczas gdy w spójnym modelu finansowym tylko jeden poziom generuje przychód, a pozostałe go modyfikują albo obciążają kosztem.

Rozważano wprowadzenie jawnego "pytania o korzeń" (który poziom jest jednostką rozliczeniową). Odrzucono ze względu na żargon — użytkownik nie myśli kategoriami "korzenia modelu", tylko kategoriami pytania biznesowego, na które chce odpowiedzieć.

## Decyzja

Scenariusz zaczyna się od wyboru **typu modelowania**, sformułowanego jako pytanie biznesowe, nie jako termin techniczny. Dostępne są trzy rozłączne typy:

| Pytanie użytkownika | Typ (fachowo) | Jednostka | Co mierzy |
|---|---|---|---|
| a) Co ten feature zrobi z moimi obecnymi klientami? | Incremental / cohort uplift modeling | Klient | Deltę w zachowaniu bazy (ARPU, churn, retencja) |
| b) Jak sprzeda się ten produkt na rynku? | Bottom-up / GTM revenue modeling | Seat | Poziom przychodu (seats × cena) |
| c) Czy opłaca się zbudować tę konkretną rzecz? | Investment appraisal / capital budgeting | Interakcja / nakład | Opłacalność inwestycji (NPV, IRR, payback) |

Relacja między typami: **a** i **c** operują na przyroście (delta), przy czym c = a + rachunek inwestycyjny (odejmuje nakład i dyskontuje). **b** operuje na poziomie, nie na przyroście — i właśnie dlatego nie sumuje się poprawnie z a ani c.

Typ c (capital budgeting) jest pierwotnym przeznaczeniem Sherpy. Typy a i b są świadomym rozszerzeniem zakresu, każdy z własną, rozłączną rolą.

## Konsekwencje

Pozytywne:
- Każdy typ odpowiada na jedno pytanie i ma jedną jednostkę rozliczeniową — znika sumowanie niespójnych strumieni.
- Język interfejsu jest biznesowy, nie modelarski; obniża próg wejścia.
- Rozłączne role ułatwiają tłumaczenie narzędzia (istotne dla projektu portfolio) i upraszczają walidację (patrz ADR 0004).

Negatywne / koszty:
- Wybór typu staje się obowiązkowym pierwszym krokiem scenariusza — to zmiana w przepływie tworzenia.
- Istniejące scenariusze (np. "AI Agent" z `revenue_source: both`) wymagają migracji do jednego z trzech typów.

Wymaga dalszych decyzji:
- Który poziom jest nośnikiem przychodu w każdym typie → ADR 0002.
- Jak override monetyzacji zachowuje się w każdym typie → ADR 0003.
- Jak egzekwować jeden nośnik (zakaz "both" bez mostka) → ADR 0004.
