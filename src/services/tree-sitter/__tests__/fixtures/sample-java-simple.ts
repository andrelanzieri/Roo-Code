export default String.raw`
// Test interface with methods
interface TestInterface {
    void testMethod();
    String getName();
    int calculate(int a, int b);
}

// Test class implementing interface with annotations
class TestClass implements TestInterface {
    
    @Override
    public void testMethod() {
        // Implementation goes here
    }
    
    @Override
    public String getName() {
        return "TestClass";
    }
    
    @Override
    public int calculate(int a, int b) {
        return a + b;
    }
    
    private void helperMethod() {
        // Helper implementation
    }
}
`
