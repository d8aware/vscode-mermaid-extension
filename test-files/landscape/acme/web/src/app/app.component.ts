import { Button } from "@acme/ui-kit";
import { format } from "@acme/util";
import { helper } from "./helper";
import { OrdersComponent } from "./orders/orders.component";
// import { Ignored } from "@acme/ui-kit";  (comments do not count)
export class AppComponent { button = new Button(); label = format("hi"); h = helper; orders = new OrdersComponent(); }
