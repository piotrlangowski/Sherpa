import { describe, it, expect } from 'vitest';
import { importerService, type CompanyImportRecord } from './importer';

describe('Importer Service Tests', () => {
  describe('parseCSV', () => {
    it('should parse comma-separated CSV records', () => {
      const csv = `Company Name,Vertical/Industry,Join Date,Status,Revenue/ARPU
Acme Corp,Software,2026-01-10,Active,150.00
Beta Inc,Healthcare,2026-02-15,Active,200
Gamma LLC,Software,2026-01-05,Churned,80.50`;

      const records = importerService.parseCSV(csv);
      expect(records.length).toBe(3);
      expect(records[0]).toEqual({
        name: 'Acme Corp',
        vertical: 'Software',
        joinDate: '2026-01-10',
        status: 'active',
        monthlyRevenue: 150
      });
      expect(records[2]).toEqual({
        name: 'Gamma LLC',
        vertical: 'Software',
        joinDate: '2026-01-05',
        status: 'churned',
        monthlyRevenue: 80.50
      });
    });

    it('should parse semicolon-separated CSV records with quotes', () => {
      const csv = `"Company Name";"Vertical";"Join Date";"Status";"MRR"
"Acme Corp";"Enterprise SaaS";"2026-01-01";"Active";"$500"
"Delta Group";"Finance";"2026-03-01";"Churned";"1,200.00"`;

      const records = importerService.parseCSV(csv);
      expect(records.length).toBe(2);
      expect(records[0].name).toBe('Acme Corp');
      expect(records[0].vertical).toBe('Enterprise SaaS');
      expect(records[0].status).toBe('active');
      expect(records[0].monthlyRevenue).toBe(500);

      expect(records[1].name).toBe('Delta Group');
      expect(records[1].monthlyRevenue).toBe(1200);
    });
  });

  describe('calculateMetrics', () => {
    it('should group companies into verticals and cohorts and compute aggregates', () => {
      const records: CompanyImportRecord[] = [
        { name: 'A', vertical: 'SaaS', joinDate: '2026-01-10', status: 'active', monthlyRevenue: 100 },
        { name: 'B', vertical: 'SaaS', joinDate: '2026-01-20', status: 'active', monthlyRevenue: 150 },
        { name: 'C', vertical: 'SaaS', joinDate: '2026-02-05', status: 'active', monthlyRevenue: 200 },
        { name: 'D', vertical: 'SaaS', joinDate: '2026-01-15', status: 'churned', monthlyRevenue: 120 },
        { name: 'E', vertical: 'Fintech', joinDate: '2026-01-01', status: 'active', monthlyRevenue: 500 }
      ];

      const result = importerService.calculateMetrics(records);
      expect(result.length).toBe(2); // SaaS and Fintech

      const saasVertical = result.find(v => v.name === 'SaaS');
      expect(saasVertical).toBeDefined();
      expect(saasVertical!.cohorts.length).toBe(2); // Jan and Feb cohorts

      const janSacCohort = saasVertical!.cohorts.find(c => c.name === 'Cohort 2026-01');
      expect(janSacCohort).toBeDefined();
      expect(janSacCohort!.currentUsers).toBe(2); // A & B active (D is churned)
      // ARPU = (100 + 150) / 2 = 125
      expect(janSacCohort!.baseArpu).toBe(125);
      
      // Churn rate for SaaS overall: D is churned, total 4 = 1/4 = 0.25 (25%)
      expect(janSacCohort!.monthlyChurnRate).toBe(0.25);
    });
  });

  describe('mapHubSpotToRecords', () => {
    it('should correctly map HubSpot companies and deals to records', () => {
      const companies = [
        { id: 'c1', properties: { name: 'Acme LLC', industry: 'Technology' } },
        { id: 'c2', properties: { name: 'HealthCorp', industry: 'Healthcare' } }
      ];

      const deals = [
        {
          id: 'd1',
          properties: {
            dealname: 'Acme Deal',
            amount: '250.00',
            closedate: '2026-01-10T12:00:00Z',
            dealstage: 'closedwon'
          },
          associations: {
            companies: {
              results: [{ id: 'c1', type: 'deal_to_company' }]
            }
          }
        },
        {
          id: 'd2',
          properties: {
            dealname: 'Lost Deal',
            amount: '500.00',
            closedate: '2026-02-15T09:30:00Z',
            dealstage: 'closedlost'
          },
          associations: {
            companies: {
              results: [{ id: 'c2', type: 'deal_to_company' }]
            }
          }
        }
      ];

      const records = importerService.mapHubSpotToRecords(companies, deals);
      expect(records.length).toBe(2);

      const activeRecord = records.find(r => r.name === 'Acme LLC');
      expect(activeRecord).toBeDefined();
      expect(activeRecord!.vertical).toBe('Technology');
      expect(activeRecord!.status).toBe('active');
      expect(activeRecord!.monthlyRevenue).toBe(250);

      const lostRecord = records.find(r => r.name === 'HealthCorp');
      expect(lostRecord).toBeDefined();
      expect(lostRecord!.vertical).toBe('Healthcare');
      expect(lostRecord!.status).toBe('churned');
    });
  });
});
