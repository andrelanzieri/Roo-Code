/*
Perl Tree-sitter Query Patterns
*/
const perlQuery = `
; Package declarations
(package_statement
  name: (package) @name.definition.module) @definition.module

; Subroutine definitions
(subroutine_declaration_statement
  name: (bareword) @name.definition.function) @definition.function

(subroutine_declaration_statement
  name: (special_bareword) @name.definition.function) @definition.function

; Method definitions (sub with attributes)
(subroutine_declaration_statement
  attribute: (subroutine_attribute) @definition.method.attribute
  name: (bareword) @name.definition.method) @definition.method

; Anonymous subroutines
(anonymous_subroutine) @definition.anonymous_function

; Variable declarations (my, our, local, state)
(variable_declaration
  (my) @definition.variable.scope
  variable: (_) @name.definition.variable) @definition.variable

(variable_declaration
  (our) @definition.variable.scope
  variable: (_) @name.definition.variable) @definition.variable

(variable_declaration
  (local) @definition.variable.scope
  variable: (_) @name.definition.variable) @definition.variable

(variable_declaration
  (state) @definition.variable.scope
  variable: (_) @name.definition.variable) @definition.variable

; Use statements (modules)
(use_statement
  module: (bareword) @name.definition.import) @definition.import

(use_statement
  module: (package) @name.definition.import) @definition.import

; Require statements
(require_statement
  module: (_) @name.definition.require) @definition.require

; BEGIN, END, CHECK, INIT, UNITCHECK blocks
(phaser_statement
  phase: (begin) @name.definition.phaser) @definition.phaser

(phaser_statement
  phase: (end) @name.definition.phaser) @definition.phaser

(phaser_statement
  phase: (check) @name.definition.phaser) @definition.phaser

(phaser_statement
  phase: (init) @name.definition.phaser) @definition.phaser

(phaser_statement
  phase: (unitcheck) @name.definition.phaser) @definition.phaser

; Regex definitions
(match_regex) @definition.regex
(substitution_regex) @definition.regex
(transliteration_regex) @definition.regex

; Format declarations
(format_statement
  name: (bareword) @name.definition.format) @definition.format

; POD documentation blocks
(pod) @definition.documentation

; Constant declarations
(use_constant_statement
  name: (bareword) @name.definition.constant) @definition.constant

; Class definitions (for Moose/Moo/Object::Pad style)
(statement_containing_expression
  (function_call
    function: (bareword) @_has
    arguments: (argument_list
      (string_literal) @name.definition.attribute))
  (#eq? @_has "has")) @definition.attribute

; Label definitions
(labeled_statement
  label: (label) @name.definition.label) @definition.label

; Prototypes
(subroutine_declaration_statement
  prototype: (prototype) @definition.prototype
  name: (bareword) @name.definition.function_with_prototype) @definition.function_with_prototype

; Special blocks (AUTOLOAD)
(subroutine_declaration_statement
  name: (special_bareword) @name.definition.special_function
  (#match? @name.definition.special_function "^(AUTOLOAD|DESTROY)$")) @definition.special_function
`

export default perlQuery
export { perlQuery }
