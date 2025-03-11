import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Order } from "./types";

interface OrdersTableProps {
  orders: Order[];
  isRunning: boolean;
  cancelOrder: (order: Order) => Promise<void>;
  cancelAllOrders: () => Promise<void>;
  clearOrderHistory: () => void;
}

export function OrdersTable({
  orders,
  isRunning,
  cancelOrder,
  cancelAllOrders,
  clearOrderHistory,
}: OrdersTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Active Orders</CardTitle>
        <CardDescription>View and manage your active orders</CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length > 0 ? (
          <Table>
            <TableCaption>List of active orders</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Coin</TableHead>
                <TableHead>Side</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orders.map(order => (
                <TableRow key={order.id}>
                  <TableCell>{order.coin}</TableCell>
                  <TableCell
                    className={
                      order.side === "buy" ? "text-green-500" : "text-red-500"
                    }
                  >
                    {order.side.toUpperCase()}
                  </TableCell>
                  <TableCell>${order.price.toFixed(2)}</TableCell>
                  <TableCell>{order.size.toFixed(6)}</TableCell>
                  <TableCell>{order.status}</TableCell>
                  <TableCell>{order.timestamp.toLocaleTimeString()}</TableCell>
                  <TableCell>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => cancelOrder(order)}
                      disabled={!isRunning || order.status !== "placed"}
                    >
                      Cancel
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-gray-500">No active orders</div>
        )}
        <div className="mt-4 flex justify-end space-x-2">
          <Button
            variant="outline"
            onClick={cancelAllOrders}
            disabled={!isRunning || orders.length === 0}
          >
            Cancel All Orders
          </Button>
          <Button
            variant="outline"
            onClick={clearOrderHistory}
            disabled={orders.length === 0}
          >
            Clear History
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
