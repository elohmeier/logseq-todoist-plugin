export enum GroupingOption {
  Hierarchy = 'hierarchy',
  Project = 'project',
  Section = 'section',
  DueDate = 'due',
  Labels = 'labels',
  Priority = 'priority',
}

export enum SortingOption {
  TodoistOrder = 'order',
  DateAscending = 'date',
  DateDescending = 'dateDescending',
  PriorityAscending = 'priority',
  PriorityDescending = 'priorityDescending',
  AddedAscending = 'dateAdded',
  AddedDescending = 'dateAddedDescending',
}

export enum MetadataOption {
  Due = 'due',
  Description = 'description',
  Labels = 'labels',
  Project = 'project',
  Url = 'url',
}

export interface QueryConfig {
  name: string;
  filter: string;
  autorefresh: number;
  groupBy: GroupingOption;
  sorting: SortingOption[];
  show: Set<MetadataOption>;
}

export type QueryParseWarning = string;

export interface QueryParseSuccess {
  ok: true;
  config: QueryConfig;
  warnings: QueryParseWarning[];
}

export interface QueryParseError {
  ok: false;
  error: string;
  details?: string[];
}

export type QueryParseResult = QueryParseSuccess | QueryParseError;
