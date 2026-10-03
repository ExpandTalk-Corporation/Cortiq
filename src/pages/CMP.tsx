import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, Eye, Cookie, Users, Lock, Zap, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";

export default function CMP() {
  useSEO(seoFor("/cmp/"));
  const features = [
    {
      icon: <Cookie className="h-6 w-6" />,
      title: "Cookie Detection",
      description: "Automatic scanning and categorization of all cookies on your website"
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "Built for GDPR",
      description: "Consent-first by design: visitor analytics and third-party tags wait for consent"
    },
    {
      icon: <Users className="h-6 w-6" />,
      title: "User-Friendly Banner",
      description: "Elegant consent banner with customizable categories"
    },
    {
      icon: <Eye className="h-6 w-6" />,
      title: "Consent Tracking",
      description: "Detailed logging and analysis of user consent"
    },
    {
      icon: <Lock className="h-6 w-6" />,
      title: "Consent-Check API",
      description: "Your server asks CortIQ whether a session has the required consent before forwarding an event"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "12-Month Consent Expiry",
      description: "Consent expires after 12 months and the visitor is asked again"
    }
  ];

  const benefits = [
    "Consent-first by design",
    "Consent valid for 12 months",
    "Better user trust",
    "Professional cookie management",
    "Consent-check decisions logged server-side",
    "Google Consent Mode v2 included"
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          <Globe className="h-4 w-4 mr-2" />
          Consent-First CMP, Built for GDPR
        </Badge>
        
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
          Consent Management Platform
        </h1>
        
        <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
          Built-in consent banner with cookie detection, a server-side consent-check API
          and consent logging. Google Consent Mode v2 included.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/auth">
            <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
              Create free account
            </Button>
          </Link>
          <Link to="/features/">
            <Button size="lg" variant="outline" className="hover-lift">
              See All Features
            </Button>
          </Link>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <h2 className="text-3xl font-bold text-center mb-12">
          Complete CMP Solution for Your Website
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <Card key={index} className="hover-lift">
              <CardHeader>
                <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  {feature.icon}
                </div>
                <CardTitle className="text-xl">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-base">
                  {feature.description}
                </CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      {/* Benefits Section */}
      <section className="bg-muted/30 py-16">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl font-bold mb-6">
                Why Choose Our CMP Solution?
              </h2>
              <p className="text-muted-foreground mb-8">
                Beyond the banner, CortIQ offers a consent-check API your server can call before
                forwarding events to third parties. Only the AI-bot and security layer runs before consent,
                designed as strictly necessary security processing; you make the final legal assessment.
              </p>
              
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <Check className="h-5 w-5 text-green-500" />
                    <span>{benefit}</span>
                  </div>
                ))}
              </div>
            </div>
            
            <Card className="hover-lift">
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Shield className="h-6 w-6 text-green-500" />
                  <span>Consent-Check API</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Before your server forwards an event to GA4, Meta or Google Ads, it asks CortIQ whether
                  the session has the required consent. Every decision is logged, so you can show why an
                  event was or wasn't sent. Your server decides whether to forward; CortIQ returns the decision.
                </p>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950/20 rounded">
                    <span className="text-sm">Required consent missing</span>
                    <Badge variant="destructive">allowed: false</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-950/20 rounded">
                    <span className="text-sm">Consent given</span>
                    <Badge variant="default">allowed: true</Badge>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <h2 className="text-3xl font-bold mb-6">
          Put Consent First on Your Website
        </h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Get started with our CMP solution and gain full control over user consent 
          and data protection on your website.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/auth">
            <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
              Create free account
            </Button>
          </Link>
          <Link to="/pricing/">
            <Button size="lg" variant="outline" className="hover-lift">
              See Pricing
            </Button>
          </Link>
        </div>
      </section>
      <PublicFooter />
    </div>
  );
}
