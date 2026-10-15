import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DollarSign, ShoppingCart, TrendingUp, Users } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboardFilters } from "@/contexts/DashboardFiltersContext";
import { rangeBounds } from "@/lib/dashboard/filters";

interface EcommerceTabProps {
  selectedSiteId: string | null;
}

export const EcommerceTab = ({ selectedSiteId }: EcommerceTabProps) => {
  const { filters } = useDashboardFilters();

  const { data: ecommerceData, isLoading } = useQuery({
    queryKey: ['ecommerce-analytics', selectedSiteId, filters.from, filters.to],
    queryFn: async () => {
      if (!selectedSiteId) return null;

      const { start, end } = rangeBounds(filters.from, filters.to);
      const { data, error } = await supabase
        .from('ecommerce_events')
        .select('*')
        .eq('site_id', selectedSiteId)
        .eq('consent_granted', true)
        .gte('created_at', start)
        .lt('created_at', end);

      if (error) throw error;

      // Calculate metrics
      const productViews = data?.filter(e => e.event_type === 'view_item').length || 0;
      const addToCarts = data?.filter(e => e.event_type === 'add_to_cart').length || 0;
      const purchases = data?.filter(e => e.event_type === 'purchase') || [];
      const totalRevenue = purchases.reduce((sum, p) => sum + Number(p.revenue || 0), 0);
      const avgOrderValue = purchases.length > 0 ? totalRevenue / purchases.length : 0;
      const conversionRate = productViews > 0 ? (purchases.length / productViews) * 100 : 0;

      // Top products
      const productStats: Record<string, any> = {};
      data?.forEach(event => {
        if (!event.product_id) return;
        if (!productStats[event.product_id]) {
          productStats[event.product_id] = {
            id: event.product_id,
            name: event.product_name,
            category: event.product_category,
            views: 0,
            addToCarts: 0,
            purchases: 0,
            revenue: 0
          };
        }
        
        if (event.event_type === 'view_item') productStats[event.product_id].views++;
        if (event.event_type === 'add_to_cart') productStats[event.product_id].addToCarts++;
        if (event.event_type === 'purchase') {
          productStats[event.product_id].purchases++;
          productStats[event.product_id].revenue += Number(event.revenue || 0);
        }
      });

      const topProducts = Object.values(productStats)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);

      return {
        metrics: {
          totalRevenue,
          totalPurchases: purchases.length,
          avgOrderValue,
          conversionRate: Number(conversionRate.toFixed(2)),
          productViews,
          addToCarts
        },
        topProducts,
        recentTransactions: purchases.slice(0, 20)
      };
    },
    enabled: !!selectedSiteId
  });

  if (!selectedSiteId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>E-commerce Analytics</CardTitle>
          <CardDescription>Select a site to view e-commerce data</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">E-commerce Analytics</h2>
        <p className="text-muted-foreground">GDPR-compatible e-commerce tracking</p>
      </div>

      {/* Metrics Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ecommerceData?.metrics.totalRevenue.toLocaleString('sv-SE')} kr
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Number of Purchases</CardTitle>
            <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ecommerceData?.metrics.totalPurchases}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Average Order Value</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {ecommerceData?.metrics.avgOrderValue.toLocaleString('sv-SE')} kr
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Conversion Rate</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{ecommerceData?.metrics.conversionRate}%</div>
          </CardContent>
        </Card>
      </div>

      {/* Top Products */}
      <Card>
        <CardHeader>
          <CardTitle>Top Products</CardTitle>
          <CardDescription>Ranked by revenue</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {ecommerceData?.topProducts.map((product: any, index: number) => (
              <div key={product.id} className="flex items-center justify-between p-3 bg-secondary/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-lg text-muted-foreground">#{index + 1}</span>
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold">{product.revenue.toLocaleString('sv-SE')} kr</p>
                  <p className="text-sm text-muted-foreground">
                    {product.purchases} purchases • {product.views} views
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Shopping Funnel */}
      <Card>
        <CardHeader>
          <CardTitle>Shopping Funnel</CardTitle>
          <CardDescription>How users move through the purchase process</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-medium">Product views</span>
              <span className="font-bold">{ecommerceData?.metrics.productViews}</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div className="h-full bg-primary" style={{ width: '100%' }} />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Added to cart</span>
              <span className="font-bold">{ecommerceData?.metrics.addToCarts}</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary" 
                style={{ 
                  width: `${((ecommerceData?.metrics.addToCarts || 0) / (ecommerceData?.metrics.productViews || 1)) * 100}%` 
                }} 
              />
            </div>

            <div className="flex items-center justify-between">
              <span className="font-medium">Completed purchases</span>
              <span className="font-bold">{ecommerceData?.metrics.totalPurchases}</span>
            </div>
            <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-green-500" 
                style={{ 
                  width: `${((ecommerceData?.metrics.totalPurchases || 0) / (ecommerceData?.metrics.productViews || 1)) * 100}%` 
                }} 
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
