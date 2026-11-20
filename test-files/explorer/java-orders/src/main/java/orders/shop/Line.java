package orders.shop;

public class Line {
    private final String sku;
    private final Money price;

    public Line(String sku, Money price) { this.sku = sku; this.price = price; }

    public Money getPrice() { return price; }
}
