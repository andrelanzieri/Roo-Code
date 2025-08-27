/*
Perl Tree-sitter Query Patterns - Based on actual node-types.json structure
*/
export default `
; Subroutine declarations (main Perl construct)
(subroutine_declaration_statement
  name: (bareword) @name) @definition.function

; Package statements 
(package_statement
  name: (package) @name) @definition.package

; Use statements (imports)
(use_statement
  module: (package) @name) @definition.import

; Method declarations (modern Perl)
(method_declaration_statement
  name: (bareword) @name) @definition.method

; Class statements (modern Perl)
(class_statement
  name: (package) @name) @definition.class

; Role statements (modern Perl)
(role_statement
  name: (package) @name) @definition.role

; Variable declarations - capture any variable declaration
(variable_declaration) @definition.variable

; Assignment expressions for capturing variable assignments
(assignment_expression) @definition.assignment

; Function calls for reference tracking
(function_call_expression) @reference.function

; Method calls for reference tracking  
(method_call_expression) @reference.method
`
