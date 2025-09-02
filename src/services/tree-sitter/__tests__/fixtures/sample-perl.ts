export const samplePerlContent = `
#!/usr/bin/perl
# Comprehensive Perl sample demonstrating various language constructs

use strict;
use warnings;
use feature qw(say state signatures);
use utf8;

# Package declaration with version
package MyApp::Utils v1.2.3;

# Import statements
use List::Util qw(sum max min);
use Data::Dumper;
use Moose;
use Try::Tiny;

# Constant declarations
use constant {
    MAX_RETRIES => 3,
    TIMEOUT     => 30,
    DEBUG_MODE  => 1,
};

# Traditional subroutine
sub calculate_total {
    my ($items, $tax_rate) = @_;
    my $subtotal = sum(@$items);
    my $tax = $subtotal * $tax_rate;
    return $subtotal + $tax;
}

# Subroutine with prototype
sub add_numbers ($$) {
    my ($x, $y) = @_;
    return $x + $y;
}

# Subroutine with signatures (Perl 5.20+)
sub modern_function ($name, $age = 18, @hobbies) {
    say "Name: $name";
    say "Age: $age";
    say "Hobbies: " . join(", ", @hobbies);
    return {
        name => $name,
        age => $age,
        hobbies => \\@hobbies
    };
}

# Anonymous subroutine
my $validator = sub {
    my ($input) = @_;
    return $input =~ /^[a-zA-Z0-9]+$/;
};

# Method in OO Perl
sub new {
    my ($class, %args) = @_;
    my $self = {
        name => $args{name} // 'Unknown',
        age  => $args{age}  // 0,
    };
    bless $self, $class;
    return $self;
}

# Moose attribute
has 'username' => (
    is       => 'rw',
    isa      => 'Str',
    required => 1,
    trigger  => sub {
        my ($self, $new, $old) = @_;
        $self->log_change($old, $new);
    }
);

# Method modifier
before 'save' => sub {
    my $self = shift;
    $self->validate_data();
    $self->update_timestamp();
};

# State variable (persistent lexical)
sub counter {
    state $count = 0;
    return ++$count;
}

# BEGIN block
BEGIN {
    print "Initializing module...\\n";
    $ENV{APP_MODE} = 'development';
}

# END block
END {
    print "Cleanup operations...\\n";
    close_all_handles();
}

# Regular expression patterns
my $email_regex = qr/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$/;
my $phone_regex = qr/^\\+?[1-9]\\d{1,14}$/;

# Pattern matching
sub parse_log_entry {
    my ($line) = @_;
    if ($line =~ /^(\\d{4}-\\d{2}-\\d{2}) (\\d{2}:\\d{2}:\\d{2}) \\[(.+?)\\] (.+)$/) {
        return {
            date    => $1,
            time    => $2,
            level   => $3,
            message => $4,
        };
    }
    return undef;
}

# Substitution
sub sanitize_input {
    my ($text) = @_;
    $text =~ s/<[^>]+>//g;        # Remove HTML tags
    $text =~ s/^\\s+|\\s+$//g;     # Trim whitespace
    $text =~ tr/A-Z/a-z/;          # Convert to lowercase
    return $text;
}

# Here document
my $config = <<'END_CONFIG';
[database]
host = localhost
port = 5432
name = myapp_db

[cache]
driver = redis
ttl = 3600
END_CONFIG

# Format declaration
format REPORT =
@<<<<<<<<<<< @||||||||| @>>>>>>>>>
$name,       $status,   $score
.

# Complex data structures
my %user_permissions = (
    admin => {
        read   => 1,
        write  => 1,
        delete => 1,
    },
    user => {
        read  => 1,
        write => 0,
        delete => 0,
    },
);

# Typeglob manipulation
*alias_function = \\&original_function;

# Exception handling with eval
eval {
    dangerous_operation();
    another_risky_call();
};
if ($@) {
    warn "Error occurred: $@";
    handle_error($@);
}

# Try::Tiny exception handling
try {
    $result = risky_calculation();
} catch {
    warn "Caught error: $_";
    $result = get_default_value();
} finally {
    cleanup_resources();
};

# Given/when (smart matching)
given ($user_type) {
    when ('admin') {
        grant_full_access();
    }
    when ('moderator') {
        grant_moderate_access();
    }
    when ('user') {
        grant_basic_access();
    }
    default {
        deny_access();
    }
}

# Package with namespace
package MyApp::Model::User {
    use Moose;
    use namespace::autoclean;
    
    has 'id' => (
        is  => 'ro',
        isa => 'Int',
    );
    
    has 'email' => (
        is       => 'rw',
        isa      => 'Str',
        required => 1,
    );
    
    sub authenticate {
        my ($self, $password) = @_;
        return $self->check_password($password);
    }
    
    __PACKAGE__->meta->make_immutable;
}

# Role definition
package MyApp::Role::Timestamped {
    use Moose::Role;
    
    has 'created_at' => (
        is      => 'ro',
        isa     => 'DateTime',
        default => sub { DateTime->now },
    );
    
    has 'updated_at' => (
        is  => 'rw',
        isa => 'DateTime',
    );
    
    before 'save' => sub {
        my $self = shift;
        $self->updated_at(DateTime->now);
    };
}

# Class using role
package MyApp::Model::Post {
    use Moose;
    with 'MyApp::Role::Timestamped';
    
    has 'title' => (
        is       => 'rw',
        isa      => 'Str',
        required => 1,
    );
    
    has 'content' => (
        is  => 'rw',
        isa => 'Str',
    );
}

1; # End of module
`

export default {
	path: "test.pl",
	content: samplePerlContent,
}
