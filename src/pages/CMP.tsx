import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Shield, Eye, Cookie, Users, Lock, Zap, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import PublicNavigation from "@/components/PublicNavigation";
import { useSEO } from "@/hooks/useSEO";

export default function CMP() {
  useSEO({
    title: 'Consent Management Platform (CMP) — CortIQ',
    description: 'Cookie consent with smart nudging to increase opt-in rates. Google Consent Mode v2 built in. Server-side base analytics is designed to run banner-free; advanced tracking is consent-driven.',
  });
  const features = [
    {
      icon: <Cookie className="h-6 w-6" />,
      title: "Cookie Detection",
      description: "Automatic scanning and categorization of all cookies on your website"
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: "GDPR Compliance",
      description: "Full compliance with GDPR and other privacy regulations"
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
      title: "Server-Side Blocking",
      description: "Block third-party calls automatically based on consent"
    },
    {
      icon: <Zap className="h-6 w-6" />,
      title: "Real-Time Monitoring",
      description: "Live feed of blocked and allowed API calls"
    }
  ];

  const benefits = [
    "Automatic GDPR compliance",
    "Reduced legal risk",
    "Better user trust",
    "Professional cookie management",
    "Real-time consent monitoring",
    "Enterprise-grade security"
  ];

  return (
    <div className="min-h-screen bg-background">
      <PublicNavigation />
      
      {/* Hero Section */}
      <section className="container mx-auto px-4 py-16 text-center">
        <Badge variant="secondary" className="mb-4">
          <Globe className="h-4 w-4 mr-2" />
          GDPR-Compliant CMP Solution
        </Badge>
        
        <h1 className="text-4xl md:text-6xl font-bold mb-6 bg-gradient-primary bg-clip-text text-transparent">
          Consent Management Platform
        </h1>
        
        <p className="text-xl text-muted-foreground mb-8 max-w-3xl mx-auto">
          Full GDPR compliance with automatic cookie management, server-side blocking 
          and real-time monitoring of user consent.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
          <Link to="/auth">
            <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
              Get Started
            </Button>
          </Link>
          <Link to="/features">
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
                Our CMP goes beyond traditional cookie banners. We actually block 
                server-side API calls based on user consent, providing true GDPR compliance.
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
                  <span>Server-Side Blocking</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground mb-4">
                  Unlike other solutions, we actually block API calls to 
                  Google Analytics, Meta Pixel and other third-party services until consent is given.
                </p>
                
                <div className="space-y-2">
                  <div className="flex justify-between items-center p-2 bg-red-50 dark:bg-red-950/20 rounded">
                    <span className="text-sm">Without consent</span>
                    <Badge variant="destructive">Blocked</Badge>
                  </div>
                  <div className="flex justify-between items-center p-2 bg-green-50 dark:bg-green-950/20 rounded">
                    <span className="text-sm">With consent</span>
                    <Badge variant="default">Allowed</Badge>
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
          Make Your Website GDPR-Compliant Today
        </h2>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Get started with our CMP solution and gain full control over user consent 
          and data protection on your website.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link to="/auth">
            <Button size="lg" className="bg-gradient-primary hover-scale hover-glow">
              Join Waitlist
            </Button>
          </Link>
          <Link to="/pricing">
            <Button size="lg" variant="outline" className="hover-lift">
              See Pricing
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
