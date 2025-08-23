export default String.raw`
// Package declaration
package com.example.comprehensive;

// Import statements
import java.util.*;
import java.util.concurrent.CompletableFuture;
import java.util.function.Function;
import java.io.IOException;
import java.lang.annotation.*;
import static java.lang.Math.PI;
import static java.util.Collections.*;

// Single-line comment
/* Multi-line comment
   spanning multiple lines */

/** 
 * JavaDoc comment for annotation
 * @since 1.0
 */
@Target({ElementType.TYPE, ElementType.METHOD, ElementType.FIELD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
@Inherited
public @interface CustomAnnotation {
    String value() default "";
    int priority() default 0;
    Class<?>[] types() default {};
    String[] tags() default {};
}

/**
 * Interface with various method types
 */
public interface GenericInterface<T extends Comparable<T>, U> {
    // Abstract method
    void abstractMethod(T param);
    
    // Default method with implementation
    default U defaultMethod(T input) {
        return processInput(input);
    }
    
    // Static method in interface
    static <V> V staticInterfaceMethod(V value) {
        return value;
    }
    
    // Private method in interface (Java 9+)
    private U processInput(T input) {
        return null;
    }
}

/**
 * Abstract class with various members
 */
public abstract class AbstractBase<T> implements GenericInterface<T, String> {
    // Protected field
    protected T data;
    
    // Static field
    private static final String CONSTANT = "CONST_VALUE";
    
    // Constructor
    protected AbstractBase(T data) {
        this.data = data;
    }
    
    // Abstract method
    public abstract T process(T input);
    
    // Concrete method
    public final String getName() {
        return this.getClass().getSimpleName();
    }
}

/**
 * Enum with constructor and methods
 */
public enum Status {
    PENDING(0, "Pending"),
    ACTIVE(1, "Active") {
        @Override
        public String getDescription() {
            return "Currently active: " + description;
        }
    },
    COMPLETED(2, "Completed"),
    FAILED(-1, "Failed");
    
    private final int code;
    protected final String description;
    
    Status(int code, String description) {
        this.code = code;
        this.description = description;
    }
    
    public String getDescription() {
        return description;
    }
}

/**
 * Main class with comprehensive Java features
 */
@CustomAnnotation(value = "MainClass", priority = 1, types = {String.class, Integer.class})
@SuppressWarnings("unchecked")
public class ComprehensiveExample<T extends Comparable<T>> 
        extends AbstractBase<T> 
        implements Serializable, Cloneable {
    
    // Serial version UID
    private static final long serialVersionUID = 1L;
    
    // Various field types
    private volatile int counter;
    private transient String tempData;
    public static final double PI_VALUE = 3.14159;
    private final List<T> items = new ArrayList<>();
    
    // Static initializer block
    static {
        System.out.println("Static initializer");
    }
    
    // Instance initializer block
    {
        counter = 0;
        tempData = "temp";
    }
    
    // Constructor with annotations
    @SuppressWarnings("deprecation")
    public ComprehensiveExample(@NonNull T initialData) {
        super(initialData);
    }
    
    // Overloaded constructor
    public ComprehensiveExample(T data, int counter) {
        this(data);
        this.counter = counter;
    }
    
    // Method with generic return type and throws clause
    @Override
    public T process(T input) throws IllegalArgumentException {
        if (input == null) {
            throw new IllegalArgumentException("Input cannot be null");
        }
        return input;
    }
    
    // Synchronized method
    public synchronized void incrementCounter() {
        counter++;
    }
    
    // Method with varargs
    public void processMultiple(T... items) {
        for (T item : items) {
            this.items.add(item);
        }
    }
    
    // Generic method with bounds
    public <U extends Number & Comparable<U>> U genericMethod(U value) {
        return value;
    }
    
    // Method with array parameter
    public static void arrayMethod(String[] args, int[][] matrix) {
        System.out.println(Arrays.toString(args));
    }
    
    // Inner class
    public class InnerClass {
        private String innerField;
        
        public InnerClass(String field) {
            this.innerField = field;
        }
        
        public void accessOuter() {
            System.out.println(ComprehensiveExample.this.counter);
        }
    }
    
    // Static nested class
    public static class StaticNestedClass {
        private static int nestedCounter;
        
        public StaticNestedClass() {
            nestedCounter++;
        }
        
        public static int getCounter() {
            return nestedCounter;
        }
    }
    
    // Local class inside method
    public void methodWithLocalClass() {
        class LocalClass {
            private String localField;
            
            public LocalClass(String field) {
                this.localField = field;
            }
            
            public void printLocal() {
                System.out.println(localField);
            }
        }
        
        LocalClass local = new LocalClass("local");
        local.printLocal();
    }
    
    // Anonymous class
    public Runnable createRunnable() {
        return new Runnable() {
            @Override
            public void run() {
                System.out.println("Anonymous class");
            }
        };
    }
    
    // Lambda expressions
    public void lambdaExamples() {
        // Simple lambda
        Runnable r1 = () -> System.out.println("Lambda");
        
        // Lambda with parameters
        Function<String, Integer> f1 = s -> s.length();
        
        // Lambda with block
        Function<Integer, String> f2 = (Integer i) -> {
            String result = "Number: " + i;
            return result;
        };
        
        // Method reference
        Function<String, Integer> f3 = String::length;
    }
    
    // Try-with-resources
    public void tryWithResources() throws IOException {
        try (var resource = new AutoCloseable() {
            @Override
            public void close() throws Exception {
                System.out.println("Closing");
            }
        }) {
            // Use resource
        } catch (Exception e) {
            e.printStackTrace();
        } finally {
            System.out.println("Finally");
        }
    }
    
    // Switch expression (Java 14+)
    public String switchExpression(Status status) {
        return switch (status) {
            case PENDING -> "Waiting";
            case ACTIVE -> "Running";
            case COMPLETED -> "Done";
            case FAILED -> {
                System.out.println("Failed status");
                yield "Error";
            }
        };
    }
}

/**
 * Record class (Java 14+)
 */
public record PersonRecord(
    String name,
    int age,
    List<String> hobbies
) {
    // Compact constructor
    public PersonRecord {
        Objects.requireNonNull(name);
        if (age < 0) {
            throw new IllegalArgumentException("Age cannot be negative");
        }
    }
    
    // Additional method
    public String getInfo() {
        return String.format("%s (%d years)", name, age);
    }
    
    // Static factory method
    public static PersonRecord of(String name, int age) {
        return new PersonRecord(name, age, new ArrayList<>());
    }
}

/**
 * Sealed class (Java 17+)
 */
public sealed class Shape 
    permits Circle, Rectangle, Triangle {
    
    protected final double area;
    
    protected Shape(double area) {
        this.area = area;
    }
    
    public double getArea() {
        return area;
    }
}

// Permitted subclasses
final class Circle extends Shape {
    private final double radius;
    
    public Circle(double radius) {
        super(Math.PI * radius * radius);
        this.radius = radius;
    }
}

final class Rectangle extends Shape {
    private final double width;
    private final double height;
    
    public Rectangle(double width, double height) {
        super(width * height);
        this.width = width;
        this.height = height;
    }
}

non-sealed class Triangle extends Shape {
    public Triangle(double base, double height) {
        super(0.5 * base * height);
    }
}
`
