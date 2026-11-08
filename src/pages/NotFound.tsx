import { useLocation } from "react-router-dom";
import { useEffect } from "react";
import PublicLayout from "@/components/PublicLayout";
import { useSEO } from "@/hooks/useSEO";

const NotFound = () => {
  const location = useLocation();
  useSEO({
    title: "Page not found — CortIQ",
    description: "The page you are looking for does not exist or has moved.",
    noindex: true,
  });

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  return (
    <PublicLayout>
      <div className="flex items-center justify-center px-4 py-24">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-xl text-muted-foreground mb-4">Oops! Page not found</p>
          <a href="/" className="text-primary hover:underline">
            Return to Home
          </a>
        </div>
      </div>
    </PublicLayout>
  );
};

export default NotFound;
