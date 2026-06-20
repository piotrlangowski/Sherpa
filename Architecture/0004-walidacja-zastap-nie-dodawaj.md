# ADR 0004 — Walidacja "zastąp, nie dodawaj" (zakaz sumowania niespójnych strumieni)

- Status: Zaakceptowany
- Data: 2026-06-20
- Powiązane: ADR 0001 (typy modelowania), ADR 0002 (nośnik przychodu), ADR 0003 (override monetyzacji)

## Kontekst

ADR 0001–0003 ustalają, że w scenariuszu jest jeden nośnik przychodu i że override monetyzacji musi zastępować, a nie dodawać. Pozostaje pytanie egzekwowania: dziś nic w modelu nie pilnuje tych zasad. `revenue_source: "both"` po cichu sumuje strumień kohortowy i planowy, a `seats` jest wolnym polem bez związku z liczebnością kohorty — model przyjmie 200 000 seatów przy kohorcie 1000 klientów bez ostrzeżenia.

To nie jest błąd obliczeń, lecz **brak więzu integralności** między wymiarem kohortowym a planowym. Brakuje wielkości, której model dziś w ogóle nie liczy: ile seatów kohorta *uzasadnia* (implied population).

Rozważano trzy poziomy egzekwowania:
- Poziom 1 — twardy więz: `seats` jako funkcja kohorty (`seats = current_users × adoption`). Niemożliwe do złamania, ale odbiera elastyczność modelowania ekspansji.
- Poziom 2 — miękki strażnik: `seats` wolne, ale flaga ostrzegawcza gdy stosunek przekracza próg (analogicznie do istniejących statusów IRR).
- Poziom 3 — rozdzielenie strumieni: zakaz `revenue_source: "both"` bez jawnego mostka między strumieniami.

Wybrano **Poziom 3** jako podejście nadrzędne, ponieważ atakuje przyczynę (semantyczną niespójność sumowania), a nie tylko objaw. Poziomy 1 i 2 wciąż akceptują fikcję, że "kohorta + niezależny plan" to jeden spójny scenariusz.

## Decyzja

Model odmawia po cichu sumowania dwóch niezakotwiczonych strumieni. `revenue_source: "both"` jest dozwolony **tylko gdy istnieje jawny mostek** między strumieniami. Reguła operuje na wielkości `implied_population = current_users × ai_adoption_rate` — ile "głów" kohorta uzasadnia.

Logika walidacji (konceptualna):

```
if revenue_source == "both":
    for plan in plans:
        implied_population = current_users × ai_adoption_rate
        if plan.seats <= implied_population × TOLERANCE:     # np. TOLERANCE 1.0–1.2
            mode = "UPSELL_ON_COHORT"      # wariant A: plan sprzedawany tej kohorcie
                                           # OK, ale ostrzeż o ryzyku podwójnego liczenia
                                           # (uplift ARPU + opłata za plan mogą opisywać ten sam pieniądz)
        elif plan.has_own_cohort_dynamics: # wariant B: plan ma własną kohortę/rampę
            mode = "SEPARATE_MARKET"       # OK
        else:
            REJECT(
              "Plan sprzedaje X seatów, ale kohorta uzasadnia tylko Y. Wybierz: "
              "(1) zwiąż seats z kohortą, "
              "(2) załóż plan jako osobną kohortę, albo "
              "(3) przełącz revenue_source na 'monetization'."
            )
```

Dwa dozwolone znaczenia "both" i ich mostek:
- **Upsell na kohorcie** (wariant A): plan sprzedawany tej samej populacji; mostek = tożsamość populacji (`seats ≤ implied_population × TOLERANCE`). Wymaga rozstrzygnięcia podwójnego liczenia: plan zastępuje `arpu_uplift` albo uplift opisuje co innego niż plan.
- **Osobny rynek** (wariant B): plan celuje w nową populację; mostek = osobna kohorta z własną dynamiką (akwizycja, churn, rampa). De facto: ekspansja poza kohortę = **nowa kohorta**, nie wolne `seats` na planie (zgodnie z ADR 0002).

Jeśli żaden mostek nie istnieje, "both" jest odrzucone, a użytkownik zmuszony do wyboru `cohort` albo `monetization`.

Relacja do reguły z ADR 0003: ta sama zasada "zastąp, nie dodawaj" obowiązuje override monetyzacji na nośniku. Walidacja egzekwuje ją na granicy strumieni; ADR 0003 egzekwuje ją na granicy poziomów.

## Konsekwencje

Pozytywne:
- "200 000 seatów przy 1000 klientów" przestaje być cichą liczbą i staje się błędem walidacji z konkretnym, działającym komunikatem.
- Model zyskuje brakujący więz integralności (`implied_population`).
- Spójne z istniejącą filozofią Sherpy (statusy IRR zamiast cichych błędów).
- Wariant B formalizuje ekspansję jako osobną kohortę, co upraszcza model danych względem luźnych `seats`.

Negatywne / koszty:
- Istniejące scenariusze z `both` i niezakotwiczonymi `seats` (np. "AI Agent") zostaną oznaczone jako niepoprawne i wymagają migracji.
- `TOLERANCE` to parametr do skalibrowania — zbyt ciasny blokuje sensowne scenariusze, zbyt luźny przepuszcza fikcję.
- Wariant A ("upsell na kohorcie") wymaga osobnej logiki anty-podwójnego-liczenia (plan zastępuje uplift), co jest dodatkową złożonością.

Otwarte:
- Domyślna wartość `TOLERANCE` i czy ma być konfigurowalna per scenariusz.
- Czy ostrzeżenie wariantu A ma być twardym wymogiem rozstrzygnięcia (plan vs. uplift), czy tylko flagą.
