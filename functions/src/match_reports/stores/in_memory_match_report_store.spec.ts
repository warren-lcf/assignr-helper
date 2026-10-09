import { describe_match_report_store_contract } from './contracts/match_report_store.contract.js';
import { InMemoryMatchReportStore } from './in_memory_match_report_store.js';

describe_match_report_store_contract('InMemory', () => new InMemoryMatchReportStore());
