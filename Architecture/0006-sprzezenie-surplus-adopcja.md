# ADR 0006 — Sprzężenie surplus → adopcja (jawna elastyczność)

- Status: Proponowany
- Data: 2026-06-26
- Powiązane: ADR 0005 (EVC jako podstawa wyceny), ADR 0007 (cena z EVC per nośnik), ADR 0008 (jedna waluta bazowa)

## Kontekst

ADR 0005 czyni `capture rate` nożem dzielącym stworzoną wartość: cena vendora = `NBA + capture ×
NetValue`, surplus klienta = `(1 − capture) × NetValue`. Naturalna teza biznesowa: im większy surplus
zostaje u klienta (niższy capture), tym łatwiejsza decyzja zakupowa — szybsza i szersza adopcja, kosztem
przychodu na jednostkę. Z tej teorii wynika **optymalny `c*` maksymalizujący NPV vendora**: pośrodku
między „za drogo, mało kto kupuje" a „za tanio, zostawiasz pieniądze na stole". To jest klasyczna krzywa
popytu w przebraniu.

Pułapka jest fundamentalna: **kształt tej krzywej — a więc i `c*` — jest w całości wyznaczony przez
założenie, którego nie mamy z danych** (jak mocno adopcja reaguje na cenę). Gdyby Sherpa wyrzucała
„optymalny capture = 28%" jako twardy KPI, sprzedawałaby fałszywą precyzję — wprost przeciwnie do etosu
całej serii (pasma zamiast punktów, guarded IRR suszący IRR przy niestabilnych profilach, zakaz
podwójnego liczenia). Sprzężenie surplus→adopcja jest wartościowe, ale tylko wtedy, gdy **założenie jest
jawne, widoczne i poddane analizie wrażliwości**.

## Decyzja

1. **Sprzężenie = jawna elastyczność (1–2 parametry).** Użytkownik ustawia, jak adopcja reaguje na
   capture (np. „capture +10 pp → pułap adopcji −X%, tempo −Y%"), z konserwatywnym defaultem. Założenie
   jest pierwszorzędnym, widocznym inputem — nigdy ukrytą stałą w silniku.

2. **v1 = adopcja‑only.** Surplus moduluje wyłącznie **pułap** (`ai_adoption_rate`) i **tempo**
   (`adoption_ramp_months`; w modelu ekspansji `accelerationFactor` krzywej S). **Churn pozostaje
   napędzany istniejącym kanałem wartości** (`churn_reduction` — AI czyni produkt sticky), a **nie**
   ceną. Retencja‑jako‑funkcja‑ceny jest realna, ale drugiego rzędu i łatwo ją skonfliktować z kanałem
   wartości; odkładamy ją jako **drugą elastyczność za osobnym przełącznikiem**.

3. **Brak cyklu.** Adopcja zależy od surplusu `= (1 − capture) × NetValue`, a `NetValue` (NBA, extra
   value, switching cost, labor savings klienta) nie zależy od ceny vendora (ADR 0005). Zależność
   `cena → adopcja` nie tworzy więc pętli `cena → przychód → cena`.

4. **Reuse, zero nowego silnika wzrostu.** Mapujemy capture na istniejące pokrętła przez
   `buildPenetrationCurve` (`accelerationFactor`, `somLiftPct`) i model kohortowy.

5. **Wynik = krzywa, nie wyrocznia.** Bohaterem jest **krzywa NPV(capture)** z surplusem klienta na tej
   samej osi; optimum **zaznaczone, ale podpisane „przy Twoim założeniu"**; dodatkowo **sensitivity na
   samą elastyczność** (reakcja low/base/high), żeby było widać, czy optimum jest stabilne, czy rozjeżdża
   się przy lekkiej zmianie założenia. Żadnej preskryptywnej „magicznej liczby" jako headline KPI.

## Konsekwencje

Pozytywne:
- Najmocniejszy wyróżnik narzędzia: pokazuje **kształt problemu cenowego** zamiast udawać, że zna
  odpowiedź — krzywa trade‑offu uczy więcej niż jedna stawka.
- Pełna zgodność z etosem serii (jawne założenia, analiza wrażliwości, brak fałszywej precyzji).
- Reuse istniejącej mechaniki adopcji — brak równoległego modelu wzrostu.

Negatywne / koszty:
- Nowy mechanizm mapujący capture na pokrętła adopcji + parametry elastyczności w modelu danych i UI.
- Sweep capture (floor→ceiling) = **wielokrotne przeliczenie scenariusza** — do rozważenia koszt
  obliczeniowy i ewentualne cache'owanie.

Wymaga dalszych decyzji:
- **Retencja jako druga elastyczność** (surplus → churn) za przełącznikiem, z jawnym guardem na
  double‑counting z `churn_reduction`.
- Kalibracja / sensowne domyślne wartości elastyczności (jaki default jest „konserwatywny").
