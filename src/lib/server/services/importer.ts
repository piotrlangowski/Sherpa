import db from '../db';
import { verticalsRepository } from '../repositories/verticals';
import { cohortsRepository } from '../repositories/cohorts';
import type { CohortConfig, Vertical } from '../../types';

export interface CompanyImportRecord {
  name: string;
  vertical: string;
  joinDate: string; // ISO string or YYYY-MM-DD
  status: 'active' | 'churned';
  monthlyRevenue: number;
}

export interface CalculatedImportCohort {
  name: string;
  verticalName: string;
  currentUsers: number;
  monthlyAcquisition: number;
  acquisitionGrowthRate: number;
  monthlyChurnRate: number;
  retentionFloor: number;
  monthlyExpansionRate: number;
  aiAdoptionRate: number;
  baseArpu: number;
}

export interface CalculatedImportVertical {
  name: string;
  description: string;
  cohorts: CalculatedImportCohort[];
}

export const importerService = {
  /**
   * Parse CSV content into CompanyImportRecord array.
   * Expects headers resembling: Company Name, Vertical/Industry, Join Date, Status, Revenue/ARPU
   */
  parseCSV(csvText: string): CompanyImportRecord[] {
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];

    // Parse header line
    const rawHeaders = this.parseCSVLine(lines[0]);
    const headers = rawHeaders.map(h => h.toLowerCase().replace(/[\s_-]/g, ''));

    // Find column indexes
    const nameIdx = headers.findIndex(h => h.includes('company') || h.includes('name'));
    const verticalIdx = headers.findIndex(h => h.includes('vertical') || h.includes('industry') || h.includes('segment') || h.includes('sector'));
    const dateIdx = headers.findIndex(h => h.includes('date') || h.includes('join') || h.includes('create'));
    const statusIdx = headers.findIndex(h => h.includes('status') || h.includes('active') || h.includes('state'));
    const revenueIdx = headers.findIndex(h => h.includes('revenue') || h.includes('arpu') || h.includes('mrr') || h.includes('amount') || h.includes('value'));

    if (nameIdx === -1) {
      throw new Error('CSV is missing a "Company Name" column.');
    }

    const records: CompanyImportRecord[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const values = this.parseCSVLine(line);
      const name = values[nameIdx] || '';
      if (!name) continue;

      const vertical = verticalIdx !== -1 ? (values[verticalIdx] || 'General') : 'General';
      const joinDate = dateIdx !== -1 ? (values[dateIdx] || new Date().toISOString().split('T')[0]) : new Date().toISOString().split('T')[0];
      
      const rawStatus = statusIdx !== -1 ? (values[statusIdx] || 'active').toLowerCase() : 'active';
      const status: 'active' | 'churned' = (rawStatus.startsWith('act') || rawStatus === '1' || rawStatus === 'true' || rawStatus === 'yes') 
        ? 'active' 
        : 'churned';

      const rawRevenue = revenueIdx !== -1 ? values[revenueIdx] : '';
      const monthlyRevenue = rawRevenue ? parseFloat(rawRevenue.replace(/[^0-9.-]/g, '')) : 100;

      records.push({
        name,
        vertical,
        joinDate,
        status,
        monthlyRevenue: isNaN(monthlyRevenue) ? 100 : monthlyRevenue
      });
    }

    return records;
  },

  /**
   * Helper to parse a single CSV line supporting comma/semicolon and quotes.
   */
  parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    let delimiter = ',';

    // Auto-detect delimiter on first line if semicolon is prevalent
    if (line.includes(';') && (line.match(/;/g) || []).length > (line.match(/,/g) || []).length) {
      delimiter = ';';
    }

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result.map(val => val.replace(/^"|"$/g, ''));
  },

  /**
   * Fetch all CRM records from HubSpot API recursively.
   */
  async fetchHubSpotData(accessToken: string): Promise<{ companies: any[]; deals: any[] }> {
    const headers = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    };

    // Helper to fetch all pages of a resource from HubSpot v3 API
    const fetchAllPages = async (endpoint: string, properties: string[], associations?: string): Promise<any[]> => {
      let results: any[] = [];
      let hasMore = true;
      let after = '';

      while (hasMore) {
        let url = `https://api.hubapi.com/crm/v3/objects/${endpoint}?limit=100&properties=${properties.join(',')}`;
        if (associations) {
          url += `&associations=${associations}`;
        }
        if (after) {
          url += `&after=${after}`;
        }

        const response = await fetch(url, { headers });
        if (!response.ok) {
          const body = await response.text();
          throw new Error(`HubSpot API responded with ${response.status}: ${body}`);
        }

        const data = await response.json() as any;
        results = results.concat(data.results || []);

        if (data.paging && data.paging.next && data.paging.next.after) {
          after = data.paging.next.after;
        } else {
          hasMore = false;
        }
      }

      return results;
    };

    const companies = await fetchAllPages('companies', ['name', 'industry', 'createdate']);
    const deals = await fetchAllPages('deals', ['dealname', 'amount', 'closedate', 'dealstage'], 'companies');

    return { companies, deals };
  },

  /**
   * Aggregate company import records into Verticals and Cohorts with calculated metrics.
   */
  calculateMetrics(records: CompanyImportRecord[]): CalculatedImportVertical[] {
    const verticalMap = new Map<string, CompanyImportRecord[]>();

    // 1. Group records by Vertical
    for (const r of records) {
      const vKey = r.vertical.trim() || 'General';
      if (!verticalMap.has(vKey)) {
        verticalMap.set(vKey, []);
      }
      verticalMap.get(vKey)!.push(r);
    }

    const calculatedVerticals: CalculatedImportVertical[] = [];

    // 2. Process each Vertical
    for (const [vName, vRecords] of verticalMap.entries()) {
      // Find historical cohort signup months
      const cohortMap = new Map<string, CompanyImportRecord[]>();
      for (const vr of vRecords) {
        // Group by month of signup (YYYY-MM)
        let cohortMonth = 'Unknown';
        try {
          if (vr.joinDate) {
            const date = new Date(vr.joinDate);
            if (!isNaN(date.getTime())) {
              const y = date.getFullYear();
              const m = String(date.getMonth() + 1).padStart(2, '0');
              cohortMonth = `${y}-${m}`;
            }
          }
        } catch {
          // Fallback to unknown
        }
        if (!cohortMap.has(cohortMonth)) {
          cohortMap.set(cohortMonth, []);
        }
        cohortMap.get(cohortMonth)!.push(vr);
      }

      // Calculate monthly acquisition rate for this Vertical
      // count won accounts in last 12 months, divide by 12
      const now = new Date();
      const oneYearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      const recentAcquisitions = vRecords.filter(vr => {
        try {
          const d = new Date(vr.joinDate);
          return d >= oneYearAgo && d <= now;
        } catch {
          return false;
        }
      });
      const avgMonthlyAcquisition = Math.round((recentAcquisitions.length / 12) * 10) / 10;

      // Calculate churn rate for this Vertical
      const churnedCount = vRecords.filter(vr => vr.status === 'churned').length;
      const totalCount = vRecords.length;
      let monthlyChurn = 0.05; // default 5%
      if (totalCount > 0) {
        // rough estimate: overall churn ratio clamped to reasonable SaaS monthly limits [0.01 - 0.20]
        monthlyChurn = churnedCount / totalCount;
        if (monthlyChurn > 0.3) monthlyChurn = 0.3;
        if (monthlyChurn < 0.005) monthlyChurn = 0.01;
      }

      const cohorts: CalculatedImportCohort[] = [];

      // 3. Process each Cohort
      for (const [cMonth, cRecords] of cohortMap.entries()) {
        const activeRecords = cRecords.filter(cr => cr.status === 'active');
        const activeUsersCount = activeRecords.length;
        
        // Base ARPU calculation (average of active customers)
        let baseArpu = 100;
        if (activeUsersCount > 0) {
          const totalRevenue = activeRecords.reduce((acc, curr) => acc + curr.monthlyRevenue, 0);
          baseArpu = Math.round((totalRevenue / activeUsersCount) * 100) / 100;
        } else if (cRecords.length > 0) {
          const totalRevenue = cRecords.reduce((acc, curr) => acc + curr.monthlyRevenue, 0);
          baseArpu = Math.round((totalRevenue / cRecords.length) * 100) / 100;
        }

        cohorts.push({
          name: `Cohort ${cMonth}`,
          verticalName: vName,
          currentUsers: activeUsersCount,
          monthlyAcquisition: avgMonthlyAcquisition, // copy vertical-level average as default
          acquisitionGrowthRate: 0.02, // default 2%
          monthlyChurnRate: Math.round(monthlyChurn * 1000) / 1000,
          retentionFloor: 0.60, // default 60%
          monthlyExpansionRate: 0.02, // default 2%
          aiAdoptionRate: 0.30, // default 30%
          baseArpu
        });
      }

      // Sort cohorts chronologically
      cohorts.sort((a, b) => a.name.localeCompare(b.name));

      calculatedVerticals.push({
        name: vName,
        description: `Imported vertical containing ${cohorts.length} client cohorts.`,
        cohorts
      });
    }

    return calculatedVerticals;
  },

  /**
   * Adapt HubSpot JSON structures to CompanyImportRecord list.
   */
  mapHubSpotToRecords(companies: any[], deals: any[]): CompanyImportRecord[] {
    // 1. Build company lookup map (ID -> Details)
    const companyMap = new Map<string, { name: string; industry: string }>();
    for (const c of companies) {
      companyMap.set(c.id, {
        name: c.properties.name || 'Unnamed Company',
        industry: c.properties.industry || 'General'
      });
    }

    const records: CompanyImportRecord[] = [];

    // 2. Map deals to CompanyImportRecords
    for (const d of deals) {
      // Find associated company ID
      let companyId = '';
      if (d.associations && d.associations.companies && d.associations.companies.results && d.associations.companies.results.length > 0) {
        companyId = d.associations.companies.results[0].id;
      }

      const companyDetails = companyId ? companyMap.get(companyId) : null;
      const companyName = companyDetails ? companyDetails.name : (d.properties.dealname || 'Unnamed Account');
      const vertical = companyDetails ? companyDetails.industry : 'General';

      const amount = d.properties.amount ? parseFloat(d.properties.amount) : 100;
      const stage = (d.properties.dealstage || '').toLowerCase();
      
      const status: 'active' | 'churned' = (stage === 'closedwon' || stage.includes('won') || stage.includes('active')) 
        ? 'active' 
        : 'churned';

      records.push({
        name: companyName,
        vertical,
        joinDate: d.properties.closedate || d.properties.createdate || new Date().toISOString(),
        status,
        monthlyRevenue: isNaN(amount) ? 100 : amount
      });
    }

    return records;
  },

  /**
   * Save calculated Verticals and Cohorts into SQLite database inside a transaction.
   */
  saveImportedData(verticals: CalculatedImportVertical[]): void {
    db.transaction(() => {
      for (const cv of verticals) {
        // Find or create vertical
        let verticalId = '';
        const existingV = db.prepare('SELECT id FROM verticals WHERE name = ?').get(cv.name) as { id: string } | undefined;
        
        if (existingV) {
          verticalId = existingV.id;
        } else {
          const createdV = verticalsRepository.create({
            name: cv.name,
            description: cv.description,
            tam_users: 0,
            sam_users: 0,
            som_users: 0
          });
          verticalId = createdV.id;
        }

        // Import Cohorts
        for (const cc of cv.cohorts) {
          // Check if cohort already exists
          const existingCc = db.prepare('SELECT id FROM cohort_configs WHERE name = ? AND vertical_id = ?')
            .get(cc.name, verticalId) as { id: string } | undefined;

          if (existingCc) {
            // Update existing
            cohortsRepository.update(existingCc.id, {
              current_users: cc.currentUsers,
              monthly_acquisition: cc.monthlyAcquisition,
              acquisition_growth_rate: cc.acquisitionGrowthRate,
              monthly_churn_rate: cc.monthlyChurnRate,
              retention_floor: cc.retentionFloor,
              monthly_expansion_rate: cc.monthlyExpansionRate,
              ai_adoption_rate: cc.aiAdoptionRate,
              base_arpu: cc.baseArpu
            });
          } else {
            // Create new
            cohortsRepository.create({
              name: cc.name,
              vertical_id: verticalId,
              current_users: cc.currentUsers,
              monthly_acquisition: cc.monthlyAcquisition,
              acquisition_growth_rate: cc.acquisitionGrowthRate,
              monthly_churn_rate: cc.monthlyChurnRate,
              retention_floor: cc.retentionFloor,
              monthly_expansion_rate: cc.monthlyExpansionRate,
              ai_adoption_rate: cc.aiAdoptionRate,
              base_arpu: cc.baseArpu
            });
          }
        }
      }
    })();
  }
};
