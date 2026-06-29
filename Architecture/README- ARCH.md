# Architecture Decision Records — modelowanie scenariuszy

Seria decyzji porządkujących, jak Sherpa liczy przychód w scenariuszu. Wspólny punkt wyjścia: scenariusz "AI Agent" dawał NPV ~761 mln USD na skutek sumowania trzech opisów tego samego pieniądza (uplift ARPU kohorty + opłata za plan + override monetyzacji). Źródłem był brak jawnie wybranej jednostki rozliczeniowej.

Format: Michael Nygard (kontekst / decyzja / status / konsekwencje).

| ADR | Decyzja | Status |
|---|---|---|
| [0001](0001-trzy-typy-modelowania.md) | Trzy typy modelowania (a/b/c) zamiast "pytania o korzeń", w języku biznesowym | Zaakceptowany |
| [0002](0002-jeden-nosnik-przychodu.md) | Jeden nośnik przychodu na typ; pozostałe poziomy w roli kosztu/kontekstu | Zaakceptowany |
| [0003](0003-override-monetyzacji-na-nosniku.md) | Override monetyzacji tylko na nośniku; typ a celowo płaski (Wariant 2) | Zaakceptowany |
| [0004](0004-walidacja-zastap-nie-dodawaj.md) | Walidacja "zastąp, nie dodawaj"; zakaz `both` bez mostka (Poziom 3) | Zaakceptowany |
| [0005](0005-evc-jako-podstawa-wyceny.md) | EVC jako podstawa wyceny: cena wyprowadzana z wartości; jeden silnik, dwie soczewki (klient/vendor) + Value Pie | Proponowany |
| [0006](0006-sprzezenie-surplus-adopcja.md) | Sprzężenie surplus → adopcja: jawna elastyczność, adopcja-only v1, krzywa NPV(capture) zamiast magicznej liczby | Proponowany |
| [0007](0007-cena-z-evc-per-nosnik.md) | Wyprowadzenie ceny z EVC per nośnik: subscription-like back-solve; usage=benchmark; outcome/hybrid odłożone | Proponowany |
| [0008](0008-jedna-waluta-bazowa.md) | Inwariant jednej waluty: czysty silnik=baza, konwersja na granicy, koniec z hardcoded `$` | Proponowany |
| [0009](0009-strumienie-przychodu-per-archetyp.md) | Strumienie przychodu per archetyp: copilot (seat) + agent (interakcja) jako rozłączne strumienie; cena ≠ labor‑savings; blended margin per strumień | Proponowany |
| [0010](0010-portfel-kredytow.md) | Wspólny portfel kredytów (Podejście B): tier→pula→konwersja; kredyt hybrydowy (floor kosztowy + narzut wartości); przychód jak subskrypcja (breakage); atrybucja per strumień wg EVC; zakaz mieszania billing modeli | Proponowany |
| [0011](0011-evc-per-segment.md) | EVC per-segment — różnicowanie sufitu wartości i COGS per cohort | Zaakceptowany |

## Skrót koncepcji

Trzy typy modelowania odpowiadają trzem pytaniom biznesowym i trzem ustalonym technikom:

- a) "Co feature zrobi z moimi klientami?" → incremental / cohort uplift modeling (mierzy deltę)
- b) "Jak sprzeda się produkt na rynku?" → bottom-up / GTM revenue modeling (mierzy poziom)
- c) "Czy opłaca się to zbudować?" → investment appraisal / capital budgeting (NPV/IRR/payback)

Relacja: c = a + rachunek inwestycyjny (oba operują na przyroście). b operuje na poziomie — dlatego nie sumuje się z a/c.

Zasada nadrzędna spinająca całą serię: **tylko jeden poziom generuje przychód; reszta go modyfikuje albo obciąża kosztem. Override jest bezpieczny, gdy zastępuje, niebezpieczny, gdy dodaje.**
