import { Building2, Droplets, GraduationCap, Utensils, type LucideIcon } from 'lucide-react';

export type TangibleImpact = {
  category: string;
  headline: string;
  icon: LucideIcon;
  description: string;
  secondary?: string;
};

/** Illustrative ministry impact copy from gift amount + fund (donor-facing, not audited totals). */
export const getTangibleImpact = (amount: number, fundId: string): TangibleImpact | null => {
  if (amount <= 0) return null;

  if (fundId === 'fund-benevolence') {
    const meals = Math.floor(amount / 5);
    const groceryKits = Math.floor(amount / 25);
    return {
      category: 'Hunger Relief & Benevolence',
      headline: `${meals} Warm Nutritious Meals`,
      icon: Utensils,
      description: `Your $${amount.toFixed(0)} donation provided ${meals} warm meals for local families and unhoused neighbors through our weekly food pantry.`,
      secondary: groceryKits > 0 ? `Also funds ${groceryKits} emergency pantry grocery packs.` : undefined,
    };
  }
  if (fundId === 'fund-missions') {
    const filters = Math.floor(amount / 50);
    const medicalPacks = Math.floor(amount / 20);
    return {
      category: 'Global Compassion & Health',
      headline: filters > 0 ? `${filters} Gravity Clean Water Filters` : `${medicalPacks} Emergency Medical Kits`,
      icon: Droplets,
      description:
        filters > 0
          ? `Your $${amount.toFixed(0)} gift provided ${filters} clean water filter units, supplying safe drinking water to families for 2 years.`
          : `Your $${amount.toFixed(0)} gift provided ${medicalPacks} emergency first-aid and pediatric health kits to partner clinics.`,
      secondary: 'Directly combating waterborne diseases in rural mission partner communities.',
    };
  }
  if (fundId === 'fund-building') {
    const sqft = (amount / 100).toFixed(1);
    return {
      category: 'Sanctuary & Community Expansion',
      headline: `${sqft} Sq Ft of Youth Pavilion Construction`,
      icon: Building2,
      description: `Your $${amount.toFixed(0)} gift funded ${sqft} square feet of timber framing and classroom acoustics in our new youth community wing.`,
      secondary: 'Building safe, welcoming fellowship spaces for the next generation.',
    };
  }

  const mentoringHours = Math.floor(amount / 25);
  return {
    category: 'Pastoral Care & Youth Mentorship',
    headline: `${mentoringHours} Hours of Pastoral Counseling`,
    icon: GraduationCap,
    description: `Your $${amount.toFixed(0)} donation provided ${mentoringHours} hours of pastoral grief counseling, youth discipleship, and Sunday livestreaming.`,
    secondary: 'Sustaining biblical worship, community outreach, and chaplaincy across our city.',
  };
};
