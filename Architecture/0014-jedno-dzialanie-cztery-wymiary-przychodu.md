# ADR 0014 — Jedno działanie rynkowe, cztery wymiary przychodu (composite carrier + model relacji + pełny kreator)

- Status: Zaakceptowany
- Data: 2026-07-06
- Powiązane: ADR 0001, ADR 0002, ADR 0004, ADR 0009, ADR 0010, ADR 0012, ADR 0013

## Kontekst

ADR 0013 wprowadził panel triangulacji do zestawiania alternatywnych perspektyw przychodowych scenariusza (INC, GTM, USE, POOL). Jednakże wdrożenie to ujawniło trzy kluczowe problemy:

1. **Panel nie tłumaczył relacji:** Różnice w NPV (delty) nie wyjaśniały, co jest addytywne (rozłączny strumień przychodów), co jest pomiarem tego samego pieniądza (cross-check), a co wykluczającym się billingiem (pool vs per-usługa). Pytanie "dlaczego nie mogę zarabiać na wszystkich czterech frontach naraz?" nie znajdowało odpowiedzi w UI.
2. **Nieporównywalność baz populacyjnych:** Wskaźniki finansowe alternatywnych modułów (np. GTM €18.5M vs INC €115K) bywały zestawiane bez ostrzeżenia, mimo że wariant plan liczył `seats × price` na zupełnie innej bazie kohortowej niż wariant kohorty (inny rynek docelowy).
3. **Kreator nie zbierał kompletu danych:** Podczas gdy ADR 0013 założył nieniszczącą edycję, kreator w trybie tworzenia ("create") nie pozwalał na łatwe zdefiniowanie i modyfikację wszystkich czterech modułów naraz (zwłaszcza konfiguracji monetyzacji i credit pool tier).

## Decyzja

Wprowadza się autorytatywny kompozytowy carrier (`composite`) oraz system klasyfikacji relacji w panelu triangulacji w następujących punktach:

### 1. Autorytatywny Composite Carrier
Scenariusz może teraz przyjąć parametry `modeling_type: 'composite'` i `revenue_carrier: 'composite'`. W tym trybie silnik finansowy nie ogranicza się do jednego wybranego modułu, lecz sumuje wszystkie cztery strumienie przychodów (Cohort ARPU, Plan Seats, Services, Credit Pools), automatycznie eliminując ryzyko double-countingu (double-counting check) według precyzyjnych reguł relacji.

### 2. Klasyfikacja Relacji i Foldowanie
Definiuje się formalny model relacji (`PerspectiveRelation`) klasyfikujący powiązania modułów jako:
* **`additive` (books):** Niezależne strumienie dodawane bezpośrednio do sumy przychodów.
* **`contained` (folded):** Strumień będący podzbiorem/miarą innego strumienia; wartość jest raportowana diagnostycznie (`memoValue`), lecz nie jest sumowana.
* **`exclusive_billing` (pool_billed):** Usługi objęte zryczałtowanym rozliczaniem w ramach puli kredytów.
* **`cross_check`:** Alternatywne miary tej samej wartości.

Zasady foldowania w trybie `composite`:
* **Cohort ↔ Plan:** Jeśli `revenue_bridge === 'upsell_on_cohort'`, subskrypcja planów jest oznaczana jako `contained` (folded) i ignorowana w NPV. Jeśli `separate_market` — jest `additive`. Brak wybranego bridge przy zdefiniowanych planach i kohortach blokuje obliczenia.
* **Cohort ↔ Copilot:** Jeśli `arpu_uplift_includes_monetization === true`, monetyzacja copilota (flat add-on) jest oznaczana jako `contained` i foldowana do ARPU.
* **Cohort ↔ Agent:** Monetyzacja autonomicznego agenta (pay-per-usage/outcome) jest zawsze traktowana jako `additive` (disjoint streams).
* **Pool ↔ Service:** Usługi zdefiniowane w ryczałcie `pool_burn_rates` są oznaczane jako `exclusive_billing` (pool_billed); usługi spoza puli są rozliczane oddzielnie (`additive`).

### 3. Detekcja Nieporównywalności (Incommensurable)
Jeśli oszacowana baza użytkowników dla planu ( seats ) różni się od populacji kohortowej (`computeImpliedPopulation`) o współczynnik większy niż `REVENUE_INTEGRITY_TOLERANCE` (1.2), relacja zostaje oznaczona flagą `incommensurable: true` ("mierzy inny rynek"). Panel triangulacji wyświetla wtedy stosowne ostrzeżenie.

### 4. Ulepszenia Kreatora i UI
* **Wszystkie 4 moduły edytowalne:** W trybie `composite` wszystkie sekcje (w tym plan seats i parametry kohortowe) są w pełni aktywne i edytowalne.
* **Uproszczona kreacja monetyzacji:** W kreatorze w trybie tworzenia umożliwia się konfigurację monetyzacji (buforowaną w ukrytym polu formularza `monetizationConfigsJSON` jako JSON) i zapisywaną transakcyjnie przy tworzeniu scenariusza.
* **Opcjonalny Credit Pool Selector:** Zawsze widoczny w trybie composite jako pole opcjonalne.
* **Nowe sekcje w TriangulationPanel:** Panel triangulacji w trybie composite renderuje kompletną tabelę breakdown (Composite Component Breakdown) z rolą każdego komponentu (Additive, Folded, Pool Billed, Blocked) oraz listę wykrytych relacji ze statusem ich porównywalności.

## Konsekwencje

### Pozytywne:
* Spójne modelowanie złożonych inicjatyw rynkowych łączących subskrypcje, wdrożenia per-usługa, pule kredytowe i optymalizację retencji w jednym scenariuszu.
* Całkowite wyeliminowanie ryzyka double-countingu (podwójnego księgowania) dzięki precyzyjnych regułom foldowania.
* Lepsza czytelność i edukacyjna wartość panelu triangulacji.

### Negatywne:
* Wyższa złożoność kodu silnika kalkulacyjnego i formularzy.
