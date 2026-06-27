# ADR 0008 — Inwariant jednej waluty (czysty silnik = waluta bazowa)

- Status: Proponowany
- Data: 2026-06-26
- Powiązane: ADR 0005 (EVC jako podstawa wyceny), ADR 0006 (sprzężenie surplus → adopcja), ADR 0007 (cena z EVC per nośnik)

## Kontekst

Incydent: EVC podane przez użytkownika „w euro", podczas gdy nota interfejsu mówiła o dolarach. Root
cause jest mechaniczny: pola EVC w kreatorze mają **zahardkodowany symbol `$`** w etykietach
(`Next Best Alternative (… , $)`, `Extra Positive Value (… , $)`, `Negative Value / Switching Costs ($)`),
a jednocześnie **EVC nie ma własnej kolumny waluty**. Wartość jest więc de facto w walucie bazowej firmy
(np. EUR), ale etykieta krzyczy `$` — mismatch etykieta↔jednostka, prowadzący do cichego błędu rzędu
kursu (np. 8% przy EUR/USD) i zamętu pojęciowego.

Infrastruktura walutowa **już istnieje**: typ `Currency` (`USD | EUR | PLN | GBP`), `ExchangeRates`,
ustawienia `currency` + `exchange_rates` + `exchange_rates_as_of`, oraz waluta per‑encja tam, gdzie jest
realnie potrzebna (providerzy domyślnie USD, `cost_items`, `services.fixed_cost_currency`). Inwariant jest
nawet częściowo spisany: „Monetary values (fees, price_per_credit) are expressed in the company base
currency". Brakuje jego **konsekwentnego egzekwowania** — zwłaszcza w EVC i w prezentacji.

## Decyzja

1. **EVC sztywno w walucie bazowej, bez waluty per‑pole.** EVC/NBA to liczba business‑case'owa, o której
   analityk myśli w walucie raportowej firmy. Dawanie EVC własnej waluty (jak provider) wprowadziłoby z
   powrotem mieszaną arytmetykę do kalkulacji wartości. Inwariant „wszystko w walucie bazowej"
   rozszerzamy **wprost na EVC** i dokumentujemy.

2. **Czysty silnik = wyłącznie waluta bazowa.** `financial-math.ts` zakłada, że **każda** wartość
   pieniężna na wejściu jest już w walucie bazowej. Konwersja per‑encja (provider USD → baza przez
   `exchange_rates`) dzieje się **na granicy DB‑aware** (`financial-engine.ts`/repozytoria), **nigdy**
   wewnątrz czystego modułu. To czyni inwariant **testowalnym** i zamyka prawdopodobne źródło rozbieżności
   „currency markup" na kartach KPI (konwersja rozsiana po środku).

3. **Koniec z zahardkodowanymi symbolami.** Wszystkie etykiety i noty pieniężne renderują symbol + kod
   ISO z ustawień przez **jeden settings‑aware formatter** (obok istniejących `formatPI`/`formatIrr`).
   Zakaz literałów `$` / „dollars" w UI.

4. **Świeżość kursów.** `exchange_rates_as_of` zasila **advisory warning** o nieświeżym kursie (waga
   `info`, spójnie z resztą diagnostyk), bez blokowania zapisu. Kursy są ręczne — zgodnie z zasadą
   local‑first (zero połączeń do chmury).

## Konsekwencje

Pozytywne:
- Zamknięcie incydentu u korzenia: jednostka wyświetlana = jednostka liczona = waluta bazowa.
- **Testowalny inwariant** (test: brak mieszanej arytmetyki walutowej w `financial-math.ts`).
- Czysta separacja odpowiedzialności (konwersja na granicy, nie w rdzeniu).

Negatywne / koszty:
- Audyt i usunięcie miejsc z zahardkodowanym `$` w UI.
- Relabel pól EVC w kreatorze na symbol z ustawień.

Wymaga dalszych decyzji:
- Czy świeżość kursu kiedykolwiek **eskaluje** ponad `info` (np. `warn` przy bardzo starym `as_of`).
