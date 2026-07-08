# ADR 0013 — Perspektywy przychodowe scenariusza

- Status: Zaakceptowany
- Data: 2026-07-03
- Powiązane: ADR 0001, ADR 0002, ADR 0004, ADR 0009, ADR 0010, ADR 0012

## Kontekst

Sherpa wymusza (ADR 0001–0004) jeden nośnik przychodu na scenariusz. To słuszna zasada gwarantująca, że każda złotówka/dolar przychodu jest księgowana dokładnie raz. Jednak trzy archetypy modelowania dzielą wspólne "podwozie" (chassis): kohorty, usługi AI, koszty operacyjne, CAPEX oraz stopę dyskontową.

Występują obecnie następujące problemy:
1. **Niszcząca edycja w kreatorze:** Zmiana pytania biznesowego (typu modelowania) w kreatorze powoduje bezpowrotne wyczyszczenie danych nieaktywnych modułów (np. ukrycie sekcji planów dla typu `incremental` sprawia, że formularz ich nie wysyła, a `updateScenario` kasuje powiązane wiersze w bazie i wstawia je na nowo).
2. **Brak kontekstu w porównywarce:** Widok `Compare` nie wyświetla typu modelowania ani nośnika przychodu porównywanych scenariuszy, co utrudnia interpretację wyników.
3. **Brak możliwości triangulacji:** Niemożliwe jest szybkie skonfrontowanie tej samej inwestycji z kilku perspektyw przychodowych jednocześnie.

Celem jest triangulacja przychodowa bez utraty dyscypliny jednego nośnika i bez zjawiska "methodology-shoppingu" — alternatywne perspektywy są jedynie widokiem diagnostycznym, podczas gdy liczba autorytatywna pozostaje przy aktywnym carrierze.

## Decyzja

Wprowadza się koncepcję perspektyw przychodowych realizowaną w następujących 5 punktach:

1. **Scenariusz jako chassis:** Scenariusz stanowi spójną całość techniczną (chassis + wypełnione moduły). Aktywny nośnik (carrier) jest jedynym autorytatywnym źródłem wyników finansowych zapisywanych w `scenario_results`.
2. **Nieniszcząca edycja (Warn, nie Block):** Łagodzi się regułę walidacji `incremental + seats > 0` z poziomu błędu (`block`) do ostrzeżenia (`warn`). Nowy komunikat brzmi: *"Plan seats are inactive under the incremental (cohort) carrier — retained as perspective data, not booked as revenue."* Silnik przy carrierze `cohort` i tak księguje zero przychodu z planów, więc wczesny powrót nie narusza bridge'ów. Kreator (ScenarioWizard) renderuje ukryte inputy dla niewidocznych sekcji (plany, packi), dzięki czemu zmiana typu modelowania nie niszczy wprowadzonych wcześniej danych.
3. **Widoczność typu modelowania:** Dodaje się krótkie kody modelowania (`INC`, `GTM`, `USE`) oraz pełne etykiety do widoku porównywarki (`Compare`) i na stronie szczegółów scenariusza, aby od razu było widać metodologię liczenia.
4. **Duplikacja jako perspektywa:** Umożliwia się sklonowanie scenariusza z opcjonalną podmianą typu modelowania i nośnika przychodu jako fizycznej kopii (scenariusza-rodzeństwa). Wyniki nowej kopii są zawsze przeliczane na nowo od zera w bazie danych (nigdy bezpośrednio kopiowane).
5. **Triangulacja on-the-fly:** Na stronie szczegółów scenariusza dodaje się panel triangulacji obliczający na bieżąco (bez trwałego zapisu) wyniki scenariusza dla alternatywnych perspektyw przychodowych (dla wypełnionych modułów). Ponieważ koszty nie zależą od wybranego carriera, zachodzi tożsamość kosztowa:
   $$\Delta\text{NPV} = \Delta\text{PV(Revenue)}$$
   Różnice w NPV wynikają wyłącznie z wartości obecnej przychodów. Widok ten ma charakter diagnostyczny i nie pozwala na methodology-shopping.

## Konsekwencje

### Pozytywne:
- Możliwość testowania różnych założeń biznesowych bez utraty danych.
- Pełna triangulacja inwestycji na jednym ekranie z zachowaniem matematycznej tożsamości kosztów.
- Lepsza czytelność i porównywalność scenariuszy w aplikacji i przez MCP.

### Negatywne / Odnotowany smell (out of scope):
- Walidacja konfiguracji po stronie aplikacji (`validateScenarioConfig`) biegnie przed `attachMonetization`, co sprawia, że blokada `incremental` + copilot monetization praktycznie nie odpala w przeglądarce (odpala za to poprawnie w MCP). Naprawa tego architektonicznego rozjazdu wymaga osobnego issue/refaktoryzacji kolejności składania danych w loaders.

## Poprawki i Uzupełnienia

- **Lipiec 2026:** Usunięto z interfejsu nagłówka (`+page.svelte`) menu dropdown "Duplicate As..." na rzecz zwykłego przycisku "Duplicate" (tworzącego dokładną kopię scenariusza). Powodem była redukcja przeładowania interfejsu (dropdown mieszał zwykłe powielanie z edycją typu modelowania) oraz dublowanie słownictwa/funkcji z panelu triangulacji. Sama możliwość programistyczna duplikacji z perspektywą (`scenariosRepository.duplicate(id, { revenue_carrier })`) pozostaje w warstwie repozytorium.
