export const samplePerl = `#!/usr/bin/perl
use strict;
use warnings;
use Data::Dumper;
use File::Path qw(make_path);

# Package declaration
package MyModule;

# Constants
use constant PI => 3.14159;
use constant DEBUG => 1;

# Our variables
our $VERSION = '1.0.0';
our @EXPORT = qw(process_data calculate_sum);

# State variable (Perl 5.10+)
state $counter = 0;

# Subroutine with prototype
sub calculate_sum($$) {
    my ($a, $b) = @_;
    return $a + $b;
}

# Method with attributes
sub new :method {
    my $class = shift;
    my $self = {
        name => shift,
        age => shift,
    };
    bless $self, $class;
    return $self;
}

# Anonymous subroutine
my $validator = sub {
    my $value = shift;
    return $value =~ /^\\d+$/;
};

# BEGIN block
BEGIN {
    print "Initializing module\\n";
}

# END block
END {
    print "Cleanup\\n";
}

# AUTOLOAD special subroutine
sub AUTOLOAD {
    our $AUTOLOAD;
    print "Called undefined method: $AUTOLOAD\\n";
}

# Regular expression operations
sub process_data {
    my $text = shift;
    
    # Match regex
    if ($text =~ /pattern(\\d+)/) {
        my $number = $1;
    }
    
    # Substitution regex
    $text =~ s/old/new/g;
    
    # Transliteration
    $text =~ tr/a-z/A-Z/;
    
    return $text;
}

# Format declaration
format REPORT =
@<<<<<<<<<< @||||| @>>>>>>>>>
$name,      $age,  $salary
.

# Label and loop
MAIN_LOOP:
for my $i (1..10) {
    next MAIN_LOOP if $i == 5;
    print "$i\\n";
}

# Try-catch equivalent with eval
eval {
    die "Error occurred";
};
if ($@) {
    print "Caught error: $@\\n";
}

# Moose-style attribute (comment for context)
# has 'attribute_name' => (
#     is => 'rw',
#     isa => 'Str',
# );

# POD documentation
=head1 NAME

MyModule - A sample Perl module

=head1 SYNOPSIS

    use MyModule;
    my $sum = calculate_sum(5, 10);

=head1 DESCRIPTION

This module provides basic mathematical operations.

=cut

# Package with version
package MyModule::Utils 1.5.0;

# Require statement
require Exporter;

# Local variable modification
sub modify_global {
    local $/ = undef;
    my $content = <DATA>;
    return $content;
}

# File handle
__DATA__
Sample data content
Multiple lines
End of data
`
