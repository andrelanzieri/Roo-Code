/*
Perl Tree-sitter Query Patterns
Enhanced version with improved documentation and structure
*/
export default `
; ============================================================================
; Core Subroutine/Function Definitions
; ============================================================================

; Traditional subroutine declarations - the main Perl construct for functions
(subroutine_declaration_statement
  name: (bareword) @name.definition.function) @definition.function

; ============================================================================
; Package/Module/Class Structure
; ============================================================================

; Package statements - fundamental Perl organizational unit
; Captures both traditional packages and modern namespaces
(package_statement
  name: (package) @name.definition.package) @definition.package

; Use statements - imports, pragmas, and module loading
; Examples: use strict; use warnings; use List::Util qw(sum);
(use_statement
  module: (package) @name.definition.import) @definition.import

; ============================================================================
; Modern Perl OO Constructs
; ============================================================================

; Method declarations (modern Perl with method keyword)
; Used in frameworks like Moose, Moo, or with Function::Parameters
(method_declaration_statement
  name: (bareword) @name.definition.method) @definition.method

; Class statements (modern Perl OO with class keyword)
; Available in Perl 5.38+ or with Object::Pad, Corinna
(class_statement
  name: (package) @name.definition.class) @definition.class

; Role statements (Moose/Moo roles for composition)
; Used for role-based composition in modern Perl OO
(role_statement
  name: (package) @name.definition.role) @definition.role

; ============================================================================
; Variable Declarations and Assignments
; ============================================================================

; Variable declarations - captures my, our, local, state declarations
; This is a catch-all for all variable declaration types
(variable_declaration) @definition.variable

; Assignment expressions - tracks variable assignments and initializations
; Captures both simple and complex assignments
(assignment_expression) @definition.assignment

; ============================================================================
; Function and Method Calls (for reference tracking)
; ============================================================================

; Function calls - tracks usage of subroutines and built-in functions
; Examples: print(), calculate_total($items), Data::Dumper::Dumper($ref)
(function_call_expression) @reference.function

; Method calls - tracks OO method invocations
; Examples: $object->method(), $class->new(), $self->calculate()
(method_call_expression) @reference.method
`
