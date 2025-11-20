/*
Bash Tree-sitter Query Patterns
*/
export default `
; Function definitions
(function_definition
  name: (word) @name.definition.function) @definition.function

; Variable declarations and assignments
(variable_assignment
  name: (variable_name) @name.definition.variable) @definition.variable

; Export statements
(declaration_command
  name: (simple_expansion
    (variable_name) @name.definition.export)) @definition.export

; Alias definitions
(declaration_command
  name: "alias"
  value: (concatenation
    (word) @name.definition.alias)) @definition.alias

(declaration_command
  name: "alias"
  value: (word) @name.definition.alias) @definition.alias

; Source/dot commands (file includes)
(command
  name: (command_name (word) @source_cmd (#match? @source_cmd "^(source|\\.)$"))
  argument: (_) @name.definition.source) @definition.source

; Here documents
(redirected_statement
  body: (command)
  redirect: (heredoc_redirect
    (heredoc_start) @name.definition.heredoc)) @definition.heredoc

; Case statements
(case_statement
  value: (_) @name.definition.case) @definition.case

; If statements
(if_statement) @definition.if_statement

; While loops
(while_statement) @definition.while_loop

; For loops
(for_statement
  variable: (variable_name) @name.definition.for_variable) @definition.for_loop

; Array declarations
(variable_assignment
  name: (variable_name) @name.definition.array
  value: (array)) @definition.array

; Command substitutions
(command_substitution) @definition.command_substitution

; Pipeline commands
(pipeline) @definition.pipeline

; Redirections
(command
  redirect: (_)) @definition.redirection

; Test commands ([ ] and [[ ]])
(test_command) @definition.test_command

; Arithmetic expressions
(arithmetic_expansion) @definition.arithmetic

; Parameter expansions
(expansion
  (variable_name) @name.reference.variable) @reference.variable

; Comments (for documentation purposes)
(comment) @comment

; Shebang
(program
  . (comment) @shebang (#match? @shebang "^#!/"))
`
