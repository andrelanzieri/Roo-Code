/*
Query patterns for Dart language structures
*/
export default `
; Class declarations
(class_definition
  name: (identifier) @name.definition.class) @definition.class

; Abstract class declarations
(class_definition
  "abstract"
  name: (identifier) @name.definition.abstract_class) @definition.abstract_class

; Mixin declarations
(mixin_declaration
  name: (identifier) @name.definition.mixin) @definition.mixin

; Extension declarations
(extension_declaration
  name: (identifier)? @name.definition.extension) @definition.extension

; Enum declarations
(enum_declaration
  name: (identifier) @name.definition.enum) @definition.enum

; Function declarations (top-level and methods)
(function_signature
  name: (identifier) @name.definition.function) @definition.function

(method_signature
  name: (identifier) @name.definition.method) @definition.method

; Constructor declarations
(constructor_signature
  name: (identifier)? @name.definition.constructor) @definition.constructor

; Factory constructor declarations
(factory_constructor_signature
  name: (identifier)? @name.definition.factory) @definition.factory

; Getter declarations
(getter_signature
  name: (identifier) @name.definition.getter) @definition.getter

; Setter declarations
(setter_signature
  name: (identifier) @name.definition.setter) @definition.setter

; Field/Variable declarations
(initialized_variable_definition
  name: (identifier) @name.definition.field) @definition.field

(static_final_declaration
  (identifier) @name.definition.static_field) @definition.static_field

; Top-level variable declarations
(top_level_definition
  (initialized_variable_definition
    name: (identifier) @name.definition.variable)) @definition.variable

; Typedef declarations
(type_alias
  name: (identifier) @name.definition.typedef) @definition.typedef

; Import statements
(import_specification) @definition.import

; Export statements
(export_directive) @definition.export

; Part directives
(part_directive) @definition.part

; Library directives
(library_name) @definition.library

; Operator overloading
(operator_signature
  operator: (_) @name.definition.operator) @definition.operator

; Lambda/Anonymous functions
(function_expression) @definition.lambda

; Async functions
(function_body
  "async") @definition.async

; Generator functions
(function_body
  "sync*") @definition.generator

(function_body
  "async*") @definition.async_generator
`
