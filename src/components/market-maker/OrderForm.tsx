import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { orderFormSchema } from "./types";

interface OrderFormProps {
  availableCoins: string[];
  selectedCoin: string;
  isLoading: boolean;
  marketPrice: number | null;
  onSubmit: (values: z.infer<typeof orderFormSchema>) => Promise<void>;
  handleCoinChange: (value: string) => void;
  handleSideChange: (value: "buy" | "sell") => void;
}

export function OrderForm({
  availableCoins,
  selectedCoin,
  isLoading,
  marketPrice,
  onSubmit,
  handleCoinChange,
  handleSideChange,
}: OrderFormProps) {
  // Initialize order form
  const orderForm = useForm<z.infer<typeof orderFormSchema>>({
    resolver: zodResolver(orderFormSchema),
    defaultValues: {
      coin: selectedCoin,
      orderCount: 5,
      startPrice: marketPrice ? marketPrice * 0.99 : 0,
      endPrice: marketPrice ? marketPrice * 0.95 : 0,
      sizePerOrder: 0.01,
      side: "buy",
    },
  });

  return (
    <Form {...orderForm}>
      <form onSubmit={orderForm.handleSubmit(onSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={orderForm.control}
            name="coin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Coin</FormLabel>
                <Select
                  onValueChange={value => {
                    field.onChange(value);
                    handleCoinChange(value);
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select coin" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {availableCoins.map(coin => (
                      <SelectItem key={coin} value={coin}>
                        {coin}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={orderForm.control}
            name="side"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Side</FormLabel>
                <Select
                  onValueChange={(value: "buy" | "sell") => {
                    field.onChange(value);
                    handleSideChange(value);
                  }}
                  defaultValue={field.value}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select side" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="buy">Buy</SelectItem>
                    <SelectItem value="sell">Sell</SelectItem>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={orderForm.control}
            name="orderCount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Order Count</FormLabel>
                <FormControl>
                  <Input type="number" min="1" max="20" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={orderForm.control}
            name="sizePerOrder"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Size Per Order</FormLabel>
                <FormControl>
                  <Input type="number" step="0.001" min="0.001" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={orderForm.control}
            name="startPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Start Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={orderForm.control}
            name="endPrice"
            render={({ field }) => (
              <FormItem>
                <FormLabel>End Price</FormLabel>
                <FormControl>
                  <Input type="number" step="0.01" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="flex justify-between items-center">
          <div>
            {marketPrice && (
              <div className="text-sm">
                Current market price: ${marketPrice.toFixed(2)}
              </div>
            )}
          </div>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? "Placing Orders..." : "Place Orders"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
