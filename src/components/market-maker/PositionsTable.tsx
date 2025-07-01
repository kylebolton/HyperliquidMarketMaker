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

interface Position {
  coin: string;
  size: string | number;
  entryPrice: string | number;
  markPrice: string | number;
  unrealizedPnl: string | number;
  realizedPnl: string | number;
}

interface PositionsTableProps {
  positions: Position[];
  pnlData: {
    totalUnrealizedPnl: number;
    totalRealizedPnl: number;
  };
}

export function PositionsTable({ positions, pnlData }: PositionsTableProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Positions</CardTitle>
        <CardDescription>View your current positions and PnL</CardDescription>
      </CardHeader>
      <CardContent>
        {positions.length > 0 ? (
          <Table>
            <TableCaption>List of current positions</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Coin</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Entry Price</TableHead>
                <TableHead>Mark Price</TableHead>
                <TableHead>Unrealized PnL</TableHead>
                <TableHead>Realized PnL</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.map((position: Position) => (
                <TableRow key={position.coin}>
                  <TableCell className="font-medium">{position.coin}</TableCell>
                  <TableCell
                    className={
                      parseFloat(position.size.toString()) >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }
                  >
                    {parseFloat(position.size.toString()).toFixed(6)}
                  </TableCell>
                  <TableCell>
                    ${parseFloat(position.entryPrice.toString()).toFixed(2)}
                  </TableCell>
                  <TableCell>
                    ${parseFloat(position.markPrice.toString()).toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={
                      parseFloat(position.unrealizedPnl.toString()) >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }
                  >
                    ${parseFloat(position.unrealizedPnl.toString()).toFixed(2)}
                  </TableCell>
                  <TableCell
                    className={
                      parseFloat(position.realizedPnl.toString()) >= 0
                        ? "text-green-500"
                        : "text-red-500"
                    }
                  >
                    ${parseFloat(position.realizedPnl.toString()).toFixed(2)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-gray-500">
            No active positions
          </div>
        )}
        <div className="mt-6 p-4 border rounded-lg">
          <h3 className="text-lg font-medium mb-2">PnL Summary</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 bg-secondary rounded-lg">
              <div className="text-sm">Unrealized PnL</div>
              <div
                className={`text-2xl font-bold ${
                  pnlData.totalUnrealizedPnl >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                ${pnlData.totalUnrealizedPnl.toFixed(2)}
              </div>
            </div>
            <div className="p-4 bg-secondary rounded-lg">
              <div className="text-sm">Realized PnL</div>
              <div
                className={`text-2xl font-bold ${
                  pnlData.totalRealizedPnl >= 0
                    ? "text-green-500"
                    : "text-red-500"
                }`}
              >
                ${pnlData.totalRealizedPnl.toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
