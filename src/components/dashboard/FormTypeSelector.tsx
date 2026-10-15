import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  FileText, 
  ShoppingCart, 
  Mail, 
  Phone, 
  Users, 
  Settings,
  Plus,
  ExternalLink
} from 'lucide-react';

interface FormType {
  id: string;
  name: string;
  icon: React.ReactNode;
  description: string;
  color: string;
  examples: string[];
}

interface FormTypeSelectorProps {
  onTypeSelect: (type: string) => void;
  selectedType?: string;
}

const formTypes: FormType[] = [
  {
    id: 'contact_form_7',
    name: 'Contact Form 7',
    icon: <FileText className="h-5 w-5" />,
    description: 'WordPress contact form plugin',
    color: 'bg-blue-100 text-blue-700',
    examples: ['Contact forms', 'Quote requests', 'Feedback']
  },
  {
    id: 'gravity_forms',
    name: 'Gravity Forms',
    icon: <Settings className="h-5 w-5" />,
    description: 'Advanced form management',
    color: 'bg-purple-100 text-purple-700',
    examples: ['Registration', 'Surveys', 'Payments']
  },
  {
    id: 'woocommerce',
    name: 'WooCommerce',
    icon: <ShoppingCart className="h-5 w-5" />,
    description: 'E-commerce forms',
    color: 'bg-green-100 text-green-700',
    examples: ['Checkout', 'Customer registration', 'Product reviews']
  },
  {
    id: 'sentrisk',
    name: 'SentriSK',
    icon: <Users className="h-5 w-5" />,
    description: 'SentriSK lead forms (embedded via plugin, block or sentrisk-embed.js)',
    color: 'bg-orange-100 text-orange-700',
    examples: ['Lead capture', 'Newsletter signup', 'Demo booking']
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    icon: <ExternalLink className="h-5 w-5" />,
    description: 'CRM-integrated forms',
    color: 'bg-blue-100 text-blue-700',
    examples: ['Lead forms', 'Case creation', 'Contact updates']
  },
  {
    id: 'eloqua',
    name: 'Oracle Eloqua',
    icon: <Mail className="h-5 w-5" />,
    description: 'Marketing automation',
    color: 'bg-red-100 text-red-700',
    examples: ['Campaign forms', 'Event registration', 'Content gating']
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    icon: <Users className="h-5 w-5" />,
    description: 'Inbound marketing platform',
    color: 'bg-orange-100 text-orange-700',
    examples: ['Contact forms', 'Meeting booking', 'Newsletter signup']
  },
  {
    id: 'custom',
    name: 'Custom form',
    icon: <Plus className="h-5 w-5" />,
    description: 'Custom-built forms',
    color: 'bg-gray-100 text-gray-700',
    examples: ['HTML forms', 'React forms', 'JavaScript forms']
  }
];

export function FormTypeSelector({ onTypeSelect, selectedType }: FormTypeSelectorProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold mb-2">Select form type</h2>
        <p className="text-muted-foreground">
          Select which type of form solution you use to get the correct analytics configuration
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {formTypes.map((type) => (
          <Card 
            key={type.id}
            className={`cursor-pointer transition-all hover:shadow-lg ${
              selectedType === type.id ? 'ring-2 ring-primary' : ''
            }`}
            onClick={() => onTypeSelect(type.id)}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${type.color}`}>
                  {type.icon}
                </div>
                {selectedType === type.id && (
                  <Badge variant="default">Selected</Badge>
                )}
              </div>
              <CardTitle className="text-lg">{type.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {type.description}
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Common use cases:</h4>
                <ul className="text-xs text-muted-foreground space-y-1">
                  {type.examples.map((example, index) => (
                    <li key={index} className="flex items-center gap-1">
                      <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
                      {example}
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedType && (
        <div className="text-center">
          <Button onClick={() => onTypeSelect(selectedType)}>
            Continue with {formTypes.find(t => t.id === selectedType)?.name}
          </Button>
        </div>
      )}
    </div>
  );
}