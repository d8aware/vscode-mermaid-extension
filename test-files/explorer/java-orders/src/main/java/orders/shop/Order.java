// Start here: Explore Classes From Here on this file lights Order. Order
// extends Entity; its fields lead out to Line, Money and Status.
package orders.shop;

import java.util.ArrayList;
import java.util.List;

public class Order extends Entity {
    private final List<Line> lines = new ArrayList<>();
    private Money total = new Money(0, "USD");
    private Status status = Status.OPEN;

    public void add(Line line) {
        if (status != Status.OPEN) {
            throw new IllegalStateException("order is closed");
        }
        lines.add(line);
        total = total.add(line.getPrice());
    }

    public boolean isPaid() { return status == Status.PAID; }

    void markPaid() { status = Status.PAID; }

    public Money getTotal() { return total; }
}
