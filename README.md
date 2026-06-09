# Sherpa — AI Feature ROI Calculator for SaaS

Sherpa to aplikacja internetowa typu **local-first** stworzona z myślą o Dyrektorach Produktu (CPO) oraz specjalistach RevOps. Umożliwia precyzyjne modelowanie finansowe oraz szacowanie zwrotu z inwestycji (ROI) przy wdrażaniu funkcji sztucznej inteligencji (AI) do produktów SaaS.

Aplikacja integruje model kohortowy przychodów z silnikiem kalkulacji kosztów infrastruktury LLM (tokeny) oraz wydatków CAPEX/OPEX, oferując zaawansowane analizy scenariuszowe, analizę wrażliwości (wykresy Tornado) oraz integrację z modelami LLM za pomocą dedykowanego serwera MCP (Model Context Protocol).

---

## 🚀 Główne Funkcje

### 1. Zarządzanie Katalogiem (Catalog)
* **AI Services**: Definiowanie usług AI (np. czat, podsumowania), przypisywanie dostawców modeli (OpenAI, Anthropic itp.) oraz szacowanie liczby zapytań, tokenów wejściowych/wyjściowych i kosztów stałych.
* **Feature Packs**: Grupowanie usług AI w pakiety funkcjonalne.
* **Pricing Plans**: Mapowanie pakietów na plany subskrypcyjne.
* **Wizualizacja Zależności**: Interaktywny graf skierowany (DAG) w ECharts pokazujący powiązania i zależności między usługami AI.

### 2. Silnik Finansowy (Financial Engine)
* **NPV (Net Present Value)**: Dyskontowanie przepływów pieniężnych w skali miesięcznej na podstawie rocznej stopy dyskontowej.
* **IRR (Internal Rate of Return)**: Roczna wewnętrzna stopa zwrotu wyznaczana numerycznie (metoda Newtona-Raphsona z fallbackiem do bisekcji).
* **Payback Period**: Okres zwrotu z inwestycji z interpolacją liniową dla ułamków miesięcy.
* **TCO (Total Cost of Ownership)**: Całkowity koszt posiadania uwzględniający koszty tokenów LLM, infrastrukturę, utrzymanie oraz zespoły deweloperskie (CAPEX/OPEX).
* **ROI %**: Procentowy zwrot z inwestycji.

### 3. Model Kohortowy (Cohort Model)
* **Projekcje Przychodu**: Prognozy MRR/ARR na podstawie kohort użytkowników.
* **Krzywa Retencji**: Wykładniczy spadek retencji (`retention(n) = max(floor, e^(-λ·n))`).
* **Adopcja AI**: Overlay adopcji określający, jaki odsetek użytkowników w danej kohorcie faktycznie generuje koszty tokenowe.
* **Ekspansja**: Wzrost ARPU w czasie.

### 4. Analiza Wrażliwości i Porównanie Scenariuszy
* **Tornado Charts**: Analiza wpływu zmiany 6 kluczowych parametrów (churn, akwizycja, ARPU, koszty tokenów, adopcja, stopa dyskontowa) o ±10% na końcowe NPV scenariusza.
* **Scenario Comparison**: Zestawienie porównawcze wskaźników KPI oraz wykresów skumulowanego ROI, przepływów pieniężnych i liczby użytkowników dla wielu scenariuszy z obliczeniem kosztu alternatywnego ($\Delta$ NPV).

### 5. Import i Eksport Danych
* **Eksport do PNG**: Pobieranie widoku pulpitu nawigacyjnego jako estetycznego obrazu o wysokiej rozdzielczości (dzięki `html2canvas`).
* **Import/Eksport JSON & CSV**: Kompletne kopie zapasowe scenariuszy w formacie JSON oraz eksport zestawień miesięcznych do formatu CSV z automatycznym przeliczaniem po imporcie.

### 6. Serwer MCP (Model Context Protocol)
Wbudowany serwer MCP działający przez strumień standardowy (`stdio`), udostępniający 14 narzędzi oraz zasoby dla modeli LLM (np. Claude Desktop). Pozwala na:
* Odczyt i aktualizację ustawień.
* Zarządzanie usługami, pakietami i planami.
* Tworzenie i kalkulację scenariuszy z poziomu asystenta AI.
* Analizy wrażliwości i porównania.

---

## 🛠️ Stos Technologiczny

* **Frontend & Routing**: SvelteKit 2 + Svelte 5 (Runes), TypeScript
* **Stylizacja**: Tailwind CSS v4, dynamiczny ciemny motyw OKLCH (zintegrowany z shadcn-svelte)
* **Komponenty UI**: `shadcn-svelte` (napędzany przez Bits UI)
* **Wykresy**: Apache ECharts 6
* **Baza Danych**: SQLite (`better-sqlite3` z włączonym trybem WAL i obsługą kluczy obcych)
* **Walidacja danych**: Zod
* **Integracja LLM**: `@modelcontextprotocol/sdk` (wersja 1.4+)

---

## 📂 Struktura Projektu

```
Sherpa/
├── src/                      # Aplikacja SvelteKit
│   ├── lib/
│   │   ├── components/       # Komponenty UI (dashboard, katalog, layout)
│   │   ├── server/           # Logika serwerowa
│   │   │   ├── db.ts         # Singleton połączenia z SQLite
│   │   │   ├── schema.ts     # Definicje tabel (18 tabel)
│   │   │   ├── seed.ts       # Dane demonstracyjne
│   │   │   ├── repositories/ # Warstwa dostępu do danych (CRUD)
│   │   │   └── services/     # Silnik finansowy, kohorty, import/eksport
│   │   ├── stores/           # Svelte 5 stores dla stanu globalnego
│   │   └── types/            # Interfejsy TS i schematy walidacji Zod
│   └── routes/               # Ścieżki i kontrolery SvelteKit
├── mcp-server/               # Niezależny serwer MCP
│   ├── src/
│   │   ├── db.ts             # Udostępnione połączenie z bazą danych
│   │   ├── math.ts           # Wydzielona, czysta implementacja obliczeń
│   │   └── index.ts          # Definicje narzędzi (tools) i zasobów (resources)
│   └── tsconfig.json
├── data/
│   └── sherpa.db             # Baza danych SQLite (generowana automatycznie)
├── svelte.config.js
└── vite.config.ts
```

> **Tailwind CSS v4** — konfiguracja i motyw OKLCH zdefiniowane w `src/routes/layout.css` (brak pliku `tailwind.config.js`).


---

## 🚀 Uruchomienie Projektu

### Wymagania wstępne
* Node.js v18 lub nowszy
* Zainstalowane zależności (`npm install`)

### Krok 1: Instalacja zależności
W katalogu głównym projektu uruchom:
```bash
npm install
```

### Krok 2: Uruchomienie aplikacji webowej
Uruchom serwer deweloperski Vite:
```bash
npm run dev
```
Aplikacja będzie dostępna pod adresem: `http://localhost:5173/`

### Krok 3: Budowanie i uruchomienie serwera MCP (Opcjonalnie)
Aby skompilować i uruchomić serwer MCP:
```bash
# Budowanie kodu TypeScript serwera MCP
cd mcp-server
npm install
npm run build
cd ..

# Uruchomienie serwera MCP przez stdio (do debugowania lub ręcznego uruchomienia)
node mcp-server/build/index.js
```

---

## 🤖 Konfiguracja hosta MCP (np. Claude Desktop)

Aby połączyć serwer MCP Sherpa z asystentem Claude Desktop, dodaj poniższą konfigurację do pliku konfiguracyjnego Claude Desktop (zwykle w `~/Library/Application Support/Claude/claude_desktop_config.json` na macOS):

```json
{
  "mcpServers": {
    "sherpa-roi-calculator": {
      "command": "node",
      "args": ["/Users/piotrlangowski/Documents/Sherpa/mcp-server/build/index.js"],
      "cwd": "/Users/piotrlangowski/Documents/Sherpa"
    }
  }
}
```

> [!IMPORTANT]
> Parametr `cwd` musi wskazywać na katalog główny repozytorium Sherpa, tak aby serwer MCP mógł poprawnie zlokalizować plik bazy danych pod ścieżką `data/sherpa.db`. Po dodaniu konfiguracji zrestartuj Claude Desktop.

---

## 🧪 Testy i weryfikacja poprawności

Wszystkie kluczowe mechanizmy są przetestowane i gotowe do wdrożenia produkcyjnego.

* **Weryfikacja typów Svelte**:
  ```bash
  npm run check
  ```

---

## 🔒 Bezpieczeństwo i Polityka Prywatności

Sherpa to aplikacja **local-first**:
* Wszystkie dane modelu finansowego, dane klientów oraz scenariusze są przechowywane **wyłącznie lokalnie** w bazie danych SQLite na Twoim dysku twardym (`data/sherpa.db`).
* Aplikacja nie przesyła żadnych danych do chmury ani zewnętrznych serwerów telemetrycznych.
* Połączenia z zewnętrznymi dostawcami modeli AI (np. OpenAI) w celu kalkulacji kosztów pobierają wyłącznie predefiniowane cenniki modeli (ceny tokenów), bez przesyłania jakichkolwiek danych wrażliwych.
