import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Link } from "react-router-dom";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import PublicNavigation from "@/components/PublicNavigation";
import PublicFooter from "@/components/PublicFooter";
import { useSEO } from "@/hooks/useSEO";
import { seoFor } from "@/marketing-routes";
import { 
  Check, 
  Crown, 
  Mail, 
  Building2, 
  Shield,
  Headphones,
  Target,
  Users
} from "lucide-react";

export default function Pricing() {
  useSEO(seoFor("/pricing/"));
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);
  const [contactForm, setContactForm] = useState({
    name: "",
    email: "",
    company: "",
    phone: "",
    message: ""
  });

  const handleEnterpriseContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('waitlist')
        .insert({
          email: contactForm.email,
          name: contactForm.name,
          company: contactForm.company,
          phone: contactForm.phone,
          message: contactForm.message
        });

      if (error) {
        if (error.code === '23505') {
          toast({
            title: "Already submitted",
            description: "A request with this email already exists.",
          });
        } else {
          throw error;
        }
      } else {
        toast({
          title: "Request sent!",
          description: "We will get back to you.",
        });

        // Reset form
        setContactForm({
          name: "",
          email: "",
          company: "",
          phone: "",
          message: ""
        });
      }
    } catch (error: any) {
      console.error('Error sending contact:', error);
      toast({
        title: "Error",
        description: error.message || "Could not send request. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const betaFeatures = [
    "All released features included",
    "AI bot classification (training / agentic / citation)",
    "Click and scroll-depth heatmaps",
    "Form analytics and form auto-discovery",
    "Built-in consent banner with Google Consent Mode v2",
    "WordPress plugin included",
    "MCP server for AI agents"
  ];

  const enterpriseFeatures = [
    "Everything in Beta",
    "Custom onboarding — contact us"
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted">
      <PublicNavigation />
      
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <div className="text-center mb-16">
          <Badge variant="secondary" className="text-sm font-medium mb-4">
            <Crown className="h-4 w-4 mr-2" />
            Pricing Plans
          </Badge>
          <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
            Choose the right plan for your needs
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
            Free during beta, with all features. Contact us for Enterprise onboarding.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid lg:grid-cols-2 gap-8 max-w-6xl mx-auto mb-16">
          {/* Beta Plan */}
          <Card className="relative overflow-hidden border-2 border-primary hover:shadow-xl transition-shadow bg-gradient-to-br from-primary/5 to-accent/5">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-primary to-accent text-white px-3 py-1 text-sm font-medium">
              🧪 Beta
            </div>
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-accent rounded-2xl flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Beta</CardTitle>
              <CardDescription className="text-base">
                Free during beta — all features
              </CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold text-primary">Free</span>
                <br />
                <span className="text-muted-foreground text-sm">during beta</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {betaFeatures.map((feature, index) => (
                  <li key={index} className="flex items-start gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button asChild className="w-full bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90" size="lg">
                <Link to="/auth">Create free account</Link>
              </Button>
            </CardContent>
          </Card>

          {/* Enterprise Plan */}
          <Card className="relative overflow-hidden border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
            <div className="absolute top-0 right-0 bg-gradient-to-r from-primary to-primary/80 text-white px-3 py-1 text-sm font-medium">
              Enterprise
            </div>
            <CardHeader className="text-center pb-8">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-primary to-primary/60 rounded-2xl flex items-center justify-center mb-4">
                <Crown className="h-8 w-8 text-white" />
              </div>
              <CardTitle className="text-2xl font-bold">Enterprise</CardTitle>
              <CardDescription className="text-base">
                Tailored solutions for large organizations
              </CardDescription>
              <div className="mt-4">
                <span className="text-4xl font-bold">Contact Us</span>
                <br />
                <span className="text-muted-foreground text-sm">for a quote</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3 mb-8">
                {enterpriseFeatures.map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <Check className="h-4 w-4 text-primary flex-shrink-0" />
                    <span className="text-sm">{feature}</span>
                  </li>
                ))}
              </ul>
              <Button 
                variant="outline"
                className="w-full border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                size="lg"
                onClick={() => document.getElementById('enterprise-form')?.scrollIntoView({ behavior: 'smooth' })}
              >
                Contact us for a quote
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Enterprise Contact Form */}
        <div id="enterprise-form" className="max-w-2xl mx-auto">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="flex items-center justify-center gap-2">
                <Mail className="h-5 w-5" />
                Contact us for Enterprise Solution
              </CardTitle>
              <CardDescription>
                Tell us about your needs and we will get back to you with a tailored quote.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleEnterpriseContact} className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="name">Name *</Label>
                    <Input
                      id="name"
                      value={contactForm.name}
                      onChange={(e) => setContactForm(prev => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="email">Email *</Label>
                    <Input
                      id="email"
                      type="email"
                      value={contactForm.email}
                      onChange={(e) => setContactForm(prev => ({ ...prev, email: e.target.value }))}
                      required
                    />
                  </div>
                </div>
                <div className="grid md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="company">Company</Label>
                    <Input
                      id="company"
                      value={contactForm.company}
                      onChange={(e) => setContactForm(prev => ({ ...prev, company: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="message">Tell us about your needs *</Label>
                  <Textarea
                    id="message"
                    rows={4}
                    placeholder="Describe your requirements, number of page views, special features you need..."
                    value={contactForm.message}
                    onChange={(e) => setContactForm(prev => ({ ...prev, message: e.target.value }))}
                    required
                  />
                </div>
                <Button 
                  type="submit" 
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-primary to-primary/80"
                  size="lg"
                >
                  {isLoading ? "Sending..." : "Send Request"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Features Comparison */}
        <div className="mt-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose Us?</h2>
            <p className="text-lg text-muted-foreground">
              We combine powerful analytics with easy-to-use tools
            </p>
          </div>
          
          <div className="grid md:grid-cols-3 gap-8">
            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Shield className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Built for GDPR</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Built-in consent banner and cookie management — no separate CMP needed.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Headphones className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">Built in Sweden</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Developed by Expandtalk Corporation AB in Sweden, EU-hosted.
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader>
                <div className="mx-auto w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mb-4">
                  <Target className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">All-in-One</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  AI bot intelligence, heatmaps, form analytics, conversion attribution and consent management in a single platform.
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Contact Info */}
        <div className="mt-16 text-center bg-primary/5 rounded-lg p-8">
          <h3 className="text-xl font-bold mb-4">Have Questions?</h3>
          <p className="text-muted-foreground mb-6">
            Our team is happy to help you find the right solution for your needs.
          </p>
          <div className="flex justify-center gap-8 flex-wrap">
            <div className="flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              <span>info@expandtalk.se</span>
            </div>
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              <span>Expandtalk Corporation AB</span>
            </div>
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
