/**
 * Ontology API 类型定义（独立文件，供主项目与 Skill 子项目共用/拷贝）
 */

export interface LogicPropertyDataSource {
  type: 'metric-model' | 'data-view' | 'operator' | 'metric';
  id: string;
  name?: string;
}

export interface LogicPropertyParameter {
  name: string;
  value_from: 'property' | 'input';
  value: string;
  operation?: string;
}

export interface LogicProperty {
  name: string;
  display_name?: string;
  type: 'metric' | 'operator';
  comment?: string;
  index?: boolean;
  data_source: LogicPropertyDataSource;
  parameters: LogicPropertyParameter[];
}

export interface ObjectType {
  id: string;
  name: string;
  color: string;
  icon?: string;
  comment?: string;
  data_properties?: ObjectProperty[];
  logic_properties?: LogicProperty[];
  primary_keys?: string[];
  display_key?: string;
  tags?: string[];
  kn_id?: string;
  branch?: string;
  module_type?: string;
  create_time?: number;
  update_time?: number;
  creator?: { id: string; type: string; name: string };
  updater?: { id: string; type: string; name: string };
}

export interface ObjectProperty {
  id: string;
  name: string;
  alias?: string;
  display_name?: string;
  data_type: string;
  required?: boolean;
  unique?: boolean;
  indexed?: boolean;
  default_value?: any;
}

export interface RelationType {
  id: string;
  name: string;
  source_object_type_id: string;
  target_object_type_id: string;
  type: 'direct' | 'indirect';
  mapping_rules?: Array<{ source_property: { name: string }; target_property: { name: string } }>;
  tags?: string[];
  comment?: string;
  icon?: string;
  color?: string;
  detail?: string;
  kn_id?: string;
  branch?: string;
  source_object_type?: { id: string; name: string; branch?: string; icon?: string; color?: string };
  target_object_type?: { id: string; name: string; branch?: string; icon?: string; color?: string };
  creator?: { id: string; type: string; name: string };
  create_time?: number;
  updater?: { id: string; type: string; name: string };
  update_time?: number;
  module_type?: string;
}

export interface EdgeType extends RelationType {
  source_type?: string;
  target_type?: string;
  direction?: 'directed' | 'undirected';
  properties?: EdgeProperty[];
  created_at?: string;
}

export interface EdgeProperty {
  id: string;
  name: string;
  data_type: string;
}

export interface KnowledgeNetworkInfo {
  id: string;
  name: string;
  description?: string;
  tags?: string[];
  comment?: string;
  icon?: string;
  color?: string;
  branch?: string;
  create_time?: number;
  update_time?: number;
  detail?: string;
}

export interface KnowledgeNetwork {
  id: string;
  name: string;
  description?: string;
  object_types: ObjectType[];
  edge_types: EdgeType[];
  created_at?: string;
  updated_at?: string;
}

export interface ObjectTypesResponse {
  entries: ObjectType[];
  total?: number;
  offset?: number;
  limit?: number;
}

export interface RelationTypesResponse {
  entries: RelationType[];
  total_count: number;
}

export interface EdgeTypesResponse {
  edges?: EdgeType[];
  entries?: RelationType[];
  total?: number;
  total_count?: number;
}

export interface ObjectTypesQueryOptions {
  offset?: number;
  limit?: number;
  direction?: 'asc' | 'desc';
  sort?: 'create_time' | 'update_time' | 'name';
  name_pattern?: string;
}

export interface ObjectInstanceFilter {
  field: string;
  operation: '=' | '!=' | 'in' | 'not_in' | 'like' | 'not_like' | '>' | '>=' | '<' | '<=';
  value: any;
}

export interface LogicPropertyParam {
  name: string;
  params: Record<string, any>;
}

export interface ObjectInstanceSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface QueryCondition {
  operation: 'and' | 'or' | '==' | '!=' | 'in' | 'not_in' | 'like' | 'not_like' | '>' | '>=' | '<' | '<=' | 'match' | 'match_phrase' | 'knn';
  sub_conditions?: QueryCondition[];
  field?: string;
  value?: any;
  value_from?: 'const' | 'property' | 'input';
}

export interface QueryObjectInstancesOptions {
  condition?: QueryCondition;
  limit?: number;
  need_total?: boolean;
  search_after?: any[];
  include_logic_params?: boolean;
  include_type_info?: boolean;
  logic_params?: LogicPropertyParam[];
  timeout?: number;
}

export interface ObjectInstance {
  [key: string]: any;
}

export interface ObjectInstancesResponse {
  object_type?: { id: string; name: string; [key: string]: any };
  entries: ObjectInstance[];
  total_count?: number;
  search_after?: any[];
}

export interface QueryObjectPropertyValuesOptions {
  unique_identities: Array<Record<string, any>>;
  properties: string[];
  dynamic_params?: Record<string, Record<string, any>>;
}

export interface ObjectPropertyValuesResponse {
  datas?: Array<Record<string, any>>;
  entries?: Array<Record<string, any>>;
}
