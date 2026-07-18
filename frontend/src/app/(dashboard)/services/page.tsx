
'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { services as servicesApi, serviceCategories as categoriesApi, packages as packagesApi, platformSettings, getApiErrorMessage } from '@/lib/api';
import type { Service, ServiceCategory, Package } from '@/lib/api';
import { 
  Plus, Edit2, Trash2, X, Package as PackageIcon, Percent, Layers, Tag, Check, 
  HelpCircle, AlertCircle, Search, SlidersHorizontal, Megaphone, Code, Palette, 
  PenTool, Box, ExternalLink, Lightbulb, CircleDollarSign
} from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide, GuideBody } from '@/components/ui/HowToUseGuide';

const SERVICES_HOWTO = {
  overview: 'The Service Catalog is your company price list. A Service is one thing you sell (with a base price, a billing unit, and a GST rate), and a Package bundles several services together at a discount. Quotes and invoices pull their line items and prices from what you set up here, so keeping it accurate keeps client pricing consistent.',
  sections: [
    {
      heading: 'Getting started',
      items: [
        'Pick a tab: "Services by Category" for individual offerings, "Bundled Packages" for multi-service deals.',
        'Click "New Service" to add an offering — choose its category, base price, billing unit (per hour, per month, per project…), and GST rate.',
        'Click "New Package" to bundle services: tick the services to include, then set a percentage or fixed-amount discount off their combined base price.',
        'Hover over any card to reveal its edit and delete buttons.',
      ],
    },
    {
      heading: 'Pricing & discounts',
      items: [
        'A service’s Base Price is the pre-tax price for one unit (one hour, one month, one post…). GST is added on top when it is quoted or invoiced.',
        'A package starts at the sum of its services’ base prices; your discount is applied into a single final "Bundled Special" price.',
        'The discount saves exactly as you set it — a 15% discount still reads 15% when you reopen the package.',
        'Use the category filter chips at the top of the Services tab to jump straight to one category.',
      ],
    },
    {
      heading: 'Best practices',
      items: [
        'Keep names and descriptions client-friendly — they can appear on quotes and invoices.',
        'Update base prices here when your rates change; quotes that already exist keep the price they were created with.',
        'Double-check the GST rate — 18% is the standard default, but exempt items should be set to 0%.',
      ],
    },
    {
      heading: 'Common mistakes',
      items: [
        'Creating a duplicate service instead of editing the existing one — check the category first.',
        'Choosing the wrong billing unit (e.g. "Per Hour" for a fixed-scope job) — it changes how the price reads on quotes.',
        'Setting a fixed discount larger than the package’s total base price — the final price bottoms out at zero.',
      ],
    },
  ],
};

const getCategoryStyle = (name: string) => {
  if (!name) name = '';
  const lower = name.toLowerCase();
  if (lower.includes('marketing') || lower.includes('seo') || lower.includes('digital') || lower.includes('social')) {
    return {
      color: 'violet',
      borderClass: 'border-l-4 border-l-violet-500',
      bgLight: 'bg-violet-50 dark:bg-violet-900/20',
      textClass: 'text-violet-600 dark:text-violet-400',
      iconBgStyle: { backgroundColor: 'rgba(139, 92, 246, 0.1)' },
      iconColor: '#8b5cf6',
      badgeClass: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
      Icon: Megaphone
    };
  }
  if (lower.includes('dev') || lower.includes('code') || lower.includes('software') || lower.includes('web') || lower.includes('tech')) {
    return {
      color: 'emerald',
      borderClass: 'border-l-4 border-l-emerald-500',
      bgLight: 'bg-emerald-50 dark:bg-emerald-900/20',
      textClass: 'text-emerald-600 dark:text-emerald-400',
      iconBgStyle: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
      iconColor: '#10b981',
      badgeClass: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
      Icon: Code
    };
  }
  if (lower.includes('brand') || lower.includes('design') || lower.includes('logo') || lower.includes('art')) {
    return {
      color: 'orange',
      borderClass: 'border-l-4 border-l-orange-500',
      bgLight: 'bg-orange-50 dark:bg-orange-900/20',
      textClass: 'text-orange-600 dark:text-orange-400',
      iconBgStyle: { backgroundColor: 'rgba(249, 115, 22, 0.1)' },
      iconColor: '#f97316',
      badgeClass: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
      Icon: Palette
    };
  }
  if (lower.includes('copy') || lower.includes('content') || lower.includes('write') || lower.includes('writing')) {
    return {
      color: 'blue',
      borderClass: 'border-l-4 border-l-blue-500',
      bgLight: 'bg-blue-50 dark:bg-blue-900/20',
      textClass: 'text-blue-600 dark:text-blue-400',
      iconBgStyle: { backgroundColor: 'rgba(59, 130, 246, 0.1)' },
      iconColor: '#3b82f6',
      badgeClass: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
      Icon: PenTool
    };
  }
  return {
    color: 'zinc',
    borderClass: 'border-l-4 border-l-zinc-500',
    bgLight: 'bg-zinc-50 dark:bg-zinc-900/20',
    textClass: 'text-zinc-600 dark:text-zinc-400',
    iconBgStyle: { backgroundColor: 'rgba(161, 161, 170, 0.1)' },
    iconColor: '#71717a',
    badgeClass: 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400',
    Icon: Box
  };
};

const formatKOrL = (val: number) => {
  if (val >= 100000) return `₹${(val / 100000).toFixed(1).replace(/\.0$/, '')}L`;
  if (val >= 1000) return `₹${(val / 1000).toFixed(0)}K`;
  return `₹${val}`;
};

function HeaderIllustration() {
  return (
    <div className="relative w-[320px] h-[160px] hidden lg:block select-none overflow-visible shrink-0 ml-auto mr-12">
      <div className="absolute right-4 top-2 w-[160px] h-[160px] bg-violet-500/10 dark:bg-violet-500/10 rounded-full blur-[40px] z-0" />
      
      <div className="absolute right-10 top-8 w-[220px] bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700/50 rounded-xl shadow-lg p-3 z-10 transition-transform duration-500 hover:-translate-y-1">
        <div className="flex items-center gap-1.5 border-b border-zinc-100 dark:border-zinc-800/50 pb-2 mb-2">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
        </div>
        <div className="space-y-2.5">
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" strokeWidth={3} />
            </div>
            <div className="h-1.5 w-16 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-1.5 w-8 bg-violet-100 dark:bg-violet-900/40 rounded-full ml-auto" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-violet-600 dark:text-violet-400" strokeWidth={3} />
            </div>
            <div className="h-1.5 w-24 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-1.5 w-6 bg-emerald-100 dark:bg-emerald-900/40 rounded-full ml-auto" />
          </div>
          <div className="flex items-center gap-2">
            <div className="w-4 h-4 rounded border border-zinc-200 dark:border-zinc-700" />
            <div className="h-1.5 w-20 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
            <div className="h-1.5 w-10 bg-orange-100 dark:bg-orange-900/40 rounded-full ml-auto" />
          </div>
        </div>
      </div>

      <div className="absolute right-[210px] top-6 w-12 h-12 bg-gradient-to-br from-violet-400 to-indigo-600 rounded-xl shadow-xl shadow-indigo-500/20 transform -rotate-12 hover:rotate-12 transition-all duration-500 flex items-center justify-center z-20 hover:scale-110">
        <PackageIcon className="w-6 h-6 text-white" strokeWidth={1.5} />
      </div>

      <div className="absolute right-2 top-14 w-[50px] bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700/50 rounded-lg shadow-md p-2 z-20 flex flex-col items-center gap-2 transition-transform duration-500 hover:-translate-y-1">
        <div className="w-1.5 h-10 bg-zinc-100 dark:bg-zinc-800 rounded-full relative flex flex-col items-center">
          <div className="absolute top-1 w-3.5 h-3.5 bg-violet-500 rounded-full shadow border-2 border-white dark:border-[#1a1a24]" />
        </div>
        <div className="h-1 w-6 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
        <div className="h-1 w-4 bg-zinc-200 dark:bg-zinc-700 rounded-full" />
      </div>
    </div>
  );
}

export default function ServicesPage() {
  const { user } = useAuthStore();
  const canManage = (user?.permissions || []).includes('services.manage');
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [activeTab, setActiveTab] = useState<'services' | 'packages'>('services');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<number | 'all' | 'uncategorized'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('newest');

  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [editPackage, setEditPackage] = useState<Package | null>(null);

  const [serviceDeleteConfirm, setServiceDeleteConfirm] = useState<number | null>(null);
  const [packageDeleteConfirm, setPackageDeleteConfirm] = useState<number | null>(null);
  const [docsOpen, setDocsOpen] = useState(false);

  const { data: categories = [], isLoading: loadingCategories } = useQuery<ServiceCategory[]>({
    queryKey: ['serviceCategories'],
    queryFn: async () => {
      const res = await categoriesApi.list();
      return res.data || [];
    },
  });

  const { data: rawServices = [], isLoading: loadingServices, error: errorServices } = useQuery<Service[]>({
    queryKey: ['services'],
    queryFn: async () => {
      const res = await servicesApi.list();
      const data = res.data || [];
      return data.map((s: any) => ({
        ...s,
        base_price: s.base_price ?? (s.default_price !== undefined ? Number(s.default_price) : 0),
      }));
    },
  });

  const { data: settings } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: async () => (await platformSettings.get()).data,
  });
  const defaultCurrencyId = (settings?.currencies || []).find((c: any) => c.is_default)?.id
    ?? (settings?.currencies || [])[0]?.id
    ?? null;

  const { data: packagesList = [], isLoading: loadingPackages } = useQuery<Package[]>({
    queryKey: ['packages'],
    queryFn: async () => {
      const res = await packagesApi.list();
      const data = res.data || [];
      return data.map((pkg: any) => {
        const services = (pkg.services || []).map((s: any) => ({
          ...s,
          base_price: s.base_price ?? (s.default_price !== undefined ? Number(s.default_price) : 0),
        }));
        const totalBase = services.reduce((sum: number, s: any) => sum + s.base_price, 0);
        const finalPrice = pkg.price !== undefined ? Number(pkg.price) : totalBase;
        const hasStoredDiscount = pkg.discount_type === 'percentage' || pkg.discount_type === 'fixed';
        return {
          ...pkg,
          services,
          base_price: totalBase,
          price: finalPrice,
          has_discount: hasStoredDiscount
        };
      });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: servicesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      showToast('Service deleted successfully', 'success');
      setServiceDeleteConfirm(null);
    },
    onError: (err) => showToast(getApiErrorMessage(err), 'error'),
  });

  const deletePackageMutation = useMutation({
    mutationFn: packagesApi.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      showToast('Package deleted successfully', 'success');
      setPackageDeleteConfirm(null);
    },
    onError: (err) => showToast(getApiErrorMessage(err), 'error'),
  });

  // Filter & Sort Logic
  const searchedServices = rawServices.filter((s: Service) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.description && s.description.toLowerCase().includes(q));
  });

  // A service whose category was deleted (or never set) must still be
  // visible, or the cards on screen won't add up to the Total Services stat.
  const categoryIds = new Set(categories.map((c: ServiceCategory) => c.id));
  const isUncategorized = (s: Service) => !s.category_id || !categoryIds.has(s.category_id);
  const hasUncategorized = rawServices.some(isUncategorized);

  const catFilteredServices = selectedCategoryFilter === 'all'
    ? searchedServices
    : selectedCategoryFilter === 'uncategorized'
      ? searchedServices.filter(isUncategorized)
      : searchedServices.filter((s: Service) => s.category_id === selectedCategoryFilter);

  const processedServices = [...catFilteredServices].sort((a: Service, b: Service) => {
    switch (sortBy) {
      case 'newest': return b.id - a.id;
      case 'oldest': return a.id - b.id;
      case 'name': return a.name.localeCompare(b.name);
      case 'price_asc': return Number(a.base_price || 0) - Number(b.base_price || 0);
      case 'price_desc': return Number(b.base_price || 0) - Number(a.base_price || 0);
      default: return b.id - a.id;
    }
  });

  const servicesByCategory = [
    ...categories.map((cat: ServiceCategory) => ({
      ...cat,
      services: processedServices.filter((s: Service) => s.category_id === cat.id),
    })),
    { id: 'uncategorized' as const, name: 'Uncategorized', services: processedServices.filter(isUncategorized) },
  ].filter((cat: any) => selectedCategoryFilter === 'all' || cat.id === selectedCategoryFilter)
   .filter((cat: any) => cat.services.length > 0);

  const processedPackages = packagesList.filter((pkg: Package) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return pkg.name.toLowerCase().includes(q) || (pkg.description && pkg.description.toLowerCase().includes(q));
  }).sort((a: Package, b: Package) => {
    switch (sortBy) {
      case 'newest': return b.id - a.id;
      case 'oldest': return a.id - b.id;
      case 'name': return a.name.localeCompare(b.name);
      case 'price_asc': return Number(a.price || 0) - Number(b.price || 0);
      case 'price_desc': return Number(b.price || 0) - Number(a.price || 0);
      default: return b.id - a.id;
    }
  });

  if (loadingServices || loadingCategories || loadingPackages) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
      </div>
    );
  }

  if (errorServices) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-4 rounded-lg flex items-start gap-3 border border-red-100 dark:border-red-900/30">
        <AlertCircle size={20} className="mt-0.5" />
        <div>
          <h3 className="font-semibold">Failed to load services</h3>
          <p className="text-sm opacity-90">{getApiErrorMessage(errorServices)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-12 max-w-[1600px] mx-auto">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-[#12121a] shadow-sm mb-6 flex items-center">
        <div className="p-6 md:p-8 flex-1 z-10 relative">
          <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-r from-violet-500/5 to-transparent pointer-events-none" />
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2 mb-2">
            Service Catalog & Packages
            <HelpIcon title="Service Catalog & Packages" content={{
              what: 'Your master price list — every service you sell and every bundled package.',
              why: 'Quotes and invoices pull their line items from this catalog.',
              when: 'Set it up once, then update whenever you add an offering or change a rate.',
            }} />
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-xl mb-6">
            Manage your service lines, pricing models, and client bundled packages.
          </p>
          <div className="flex gap-3 relative z-20">
            <HowToUseGuide moduleKey="services" title="How the Service Catalog Works" content={SERVICES_HOWTO} />
            {canManage && (
              <button
                onClick={() => setCategoryModalOpen(true)}
                className="btn btn-secondary flex items-center gap-1.5"
              >
                <Tag size={15} /> Manage Categories
              </button>
            )}
            {canManage && (activeTab === 'services' ? (
              <button
                onClick={() => { setEditService(null); setServiceModalOpen(true); }}
                className="btn btn-primary flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={16} /> New Service
              </button>
            ) : (
              <button
                onClick={() => { setEditPackage(null); setPackageModalOpen(true); }}
                className="btn btn-primary flex items-center gap-1.5 shadow-sm"
              >
                <Plus size={16} /> New Package
              </button>
            ))}
          </div>
        </div>
        <HeaderIllustration />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left Content Column */}
        <div className="space-y-6 min-w-0">
          {/* Tabs row */}
          <div className="flex border-b border-zinc-200 dark:border-zinc-800" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
            <button
              onClick={() => { setActiveTab('services'); setSearchQuery(''); setSelectedCategoryFilter('all'); }}
              className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'services' ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
            >
              Services by Category
              {activeTab === 'services' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-600 dark:bg-violet-400 rounded-t-full" />
              )}
            </button>
            <button
              onClick={() => { setActiveTab('packages'); setSearchQuery(''); }}
              className={`pb-3 text-sm font-semibold transition-colors relative ${activeTab === 'packages' ? 'text-violet-600 dark:text-violet-400' : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-300'}`}
            >
              Bundled Packages
              {activeTab === 'packages' && (
                <div className="absolute bottom-0 left-0 w-full h-0.5 bg-violet-600 dark:bg-violet-400 rounded-t-full" />
              )}
            </button>
          </div>

          {/* Filters, Search & Sort Row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 mb-6">
            {activeTab === 'services' && (
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider mr-2">Filter Category:</span>
                <button
                  onClick={() => setSelectedCategoryFilter('all')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                    selectedCategoryFilter === 'all'
                      ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                      : 'bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                >
                  All Categories
                </button>
                {categories.map((cat: ServiceCategory) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryFilter(cat.id)}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      selectedCategoryFilter === cat.id
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                        : 'bg-transparent border border-zinc-300 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                  }`}
                  >
                    {cat.name}
                  </button>
                ))}
                {hasUncategorized && (
                  <button
                    onClick={() => setSelectedCategoryFilter('uncategorized')}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      selectedCategoryFilter === 'uncategorized'
                        ? 'bg-violet-600 text-white shadow-md shadow-violet-500/20'
                        : 'bg-transparent border border-dashed border-zinc-300 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    Uncategorized
                  </button>
                )}
              </div>
            )}
            <div className="flex flex-1 justify-end items-center gap-3 min-w-[300px]">
              <div className="relative w-full max-w-[260px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                  type="text"
                  placeholder={activeTab === 'services' ? "Search services..." : "Search packages..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all shadow-sm"
                />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-500 font-medium whitespace-nowrap">Sort by</span>
                <div className="relative">
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="appearance-none bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700 rounded-lg text-sm text-zinc-900 dark:text-zinc-100 py-2 pl-3 pr-8 focus:outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500 transition-all shadow-sm font-semibold cursor-pointer"
                  >
                    <option value="newest">Newest</option>
                    <option value="oldest">Oldest</option>
                    <option value="name">Name A-Z</option>
                    <option value="price_asc">Price Low-High</option>
                    <option value="price_desc">Price High-Low</option>
                  </select>
                  <SlidersHorizontal className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                </div>
              </div>
            </div>
          </div>

          {activeTab === 'services' && (
            <div className="space-y-8">
              {servicesByCategory.length === 0 ? (
                <div className="p-12 rounded-xl text-center border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-900/50">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <Search className="w-5 h-5 text-zinc-400" />
                  </div>
                  <p className="text-zinc-900 dark:text-zinc-100 font-semibold">No services found</p>
                  <p className="text-sm text-zinc-500 mt-1">Adjust your filters or search query to find what you're looking for.</p>
                </div>
              ) : (
                servicesByCategory.map((cat: any) => {
                  const style = getCategoryStyle(cat.name);
                  const CatIcon = style.Icon;
                  
                  return (
                    <div key={cat.id} className="space-y-4">
                      <div className="flex items-center gap-2.5 pb-2">
                        <CatIcon className={`w-5 h-5 ${style.textClass}`} />
                        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 tracking-tight">{cat.name}</h2>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {cat.services.map((service: Service) => (
                          <div
                            key={service.id}
                            className={`group relative bg-white dark:bg-[#1a1a24] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 flex flex-col justify-between overflow-hidden border border-zinc-200 dark:border-zinc-700/50 min-h-[190px] ${style.borderClass}`}
                          >
                            <div className="p-5 flex-1 flex flex-col gap-2">
                              <div className="flex justify-between items-start gap-3">
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                                    style={style.iconBgStyle}
                                  >
                                    <CatIcon style={{ color: style.iconColor }} size={20} strokeWidth={2} />
                                  </div>
                                  <div>
                                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-[15px] leading-tight mb-1.5">
                                      {service.name}
                                    </h3>
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${style.badgeClass}`}>
                                      {service.unit}
                                    </span>
                                  </div>
                                </div>
                                {canManage && (
                                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                      onClick={() => { setEditService(service); setServiceModalOpen(true); }}
                                      className="p-1.5 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                      title="Edit Service"
                                    >
                                      <Edit2 size={14} />
                                    </button>
                                    <button
                                      onClick={() => setServiceDeleteConfirm(service.id)}
                                      className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                      title="Delete Service"
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </div>
                                )}
                              </div>
                              
                              {service.description && (
                                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 mt-2">
                                  {service.description}
                                </p>
                              )}
                            </div>
                            
                            <div className="px-5 py-3 bg-zinc-50 dark:bg-zinc-900/50 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-0.5">Base Price</span>
                                <span className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                                  {formatCurrency(service.base_price || 0)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-[10px] font-semibold text-zinc-500 uppercase tracking-wider block mb-0.5">Tax Rate</span>
                                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{service.tax_rate}% GST</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {activeTab === 'packages' && (
            <div className="space-y-4">
              {processedPackages.length === 0 ? (
                <div className="p-12 rounded-xl text-center border border-dashed border-zinc-300 dark:border-zinc-700 bg-white/50 dark:bg-zinc-900/50">
                  <div className="w-12 h-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-3">
                    <PackageIcon className="w-5 h-5 text-zinc-400" />
                  </div>
                  <p className="text-zinc-900 dark:text-zinc-100 font-semibold">No packages found</p>
                  <p className="text-sm text-zinc-500 mt-1">Create a package to bundle services together.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {processedPackages.map((pkg: Package) => {
                    const servicesInPackage = pkg.services || [];
                    const hasDiscount = (pkg.discount_value || 0) > 0;
                    
                    return (
                      <div
                        key={pkg.id}
                        className="group relative bg-white dark:bg-[#1a1a24] rounded-xl shadow-sm hover:shadow-md transition-all duration-200 border border-zinc-200 dark:border-zinc-700/50 flex flex-col justify-between overflow-hidden border-l-4 border-l-violet-500"
                      >
                        <div className="p-5 flex-1">
                          <div className="flex justify-between items-start gap-3 mb-3">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 rounded-lg bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center flex-shrink-0">
                                <PackageIcon className="text-violet-600 dark:text-violet-400" size={20} strokeWidth={2} />
                              </div>
                              <div>
                                <h3 className="font-bold text-zinc-900 dark:text-zinc-100 text-[15px] leading-tight mb-1">
                                  {pkg.name}
                                </h3>
                                <div className="flex items-center gap-2">
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400">
                                    {servicesInPackage.length} Services
                                  </span>
                                </div>
                              </div>
                            </div>
                            {canManage && (
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button
                                  onClick={() => { setEditPackage(pkg); setPackageModalOpen(true); }}
                                  className="p-1.5 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                                  title="Edit Package"
                                >
                                  <Edit2 size={14} />
                                </button>
                                <button
                                  onClick={() => setPackageDeleteConfirm(pkg.id)}
                                  className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                  title="Delete Package"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            )}
                          </div>
                          
                          {pkg.description && (
                            <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-2 mb-4">
                              {pkg.description}
                            </p>
                          )}

                          {servicesInPackage.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                              <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-2">Includes:</div>
                              <ul className="space-y-1.5">
                                {servicesInPackage.slice(0, 3).map((ps: any) => {
                                  const sName = ps.service?.name || 'Unknown Service';
                                  return (
                                    <li key={ps.id || Math.random()} className="flex items-center gap-2 text-xs text-zinc-600 dark:text-zinc-300">
                                      <div className="w-1 h-1 rounded-full bg-violet-400 flex-shrink-0" />
                                      <span className="truncate">{sName}</span>
                                    </li>
                                  );
                                })}
                                {servicesInPackage.length > 3 && (
                                  <li className="text-xs text-zinc-400 font-medium pl-3">
                                    + {servicesInPackage.length - 3} more services
                                  </li>
                                )}
                              </ul>
                            </div>
                          )}
                        </div>
                        
                        <div className="px-5 py-3 bg-violet-50/50 dark:bg-violet-900/10 border-t border-violet-100 dark:border-violet-900/20 flex items-center justify-between">
                          <div>
                            <span className="text-[10px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider block mb-0.5">Package Total</span>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-violet-700 dark:text-violet-300">
                                {formatCurrency(pkg.price || 0)}
                              </span>
                            </div>
                          </div>
                          {hasDiscount && (
                            <div className="flex items-center gap-1 bg-white dark:bg-[#1a1a24] px-2 py-1 rounded shadow-sm border border-violet-100 dark:border-violet-800">
                              <Percent className="w-3 h-3 text-emerald-500" />
                              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                                {pkg.discount_type === 'percentage' ? `${pkg.discount_value}% OFF` : 'DISCOUNTED'}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Sidebar Column */}
        <div className="space-y-4">
          <div className="bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
              <PackageIcon className="w-6 h-6 text-violet-600 dark:text-violet-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Total Services</div>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{rawServices.length}</div>
              <div className="text-xs text-zinc-400 mt-1">Active across all categories</div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
              <Tag className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Categories</div>
              <div className="text-2xl font-black text-zinc-900 dark:text-zinc-100 leading-none">{categories.length}</div>
              <div className="text-xs text-zinc-400 mt-1">Service categories</div>
            </div>
          </div>

          <div className="bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-800 rounded-xl p-5 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center flex-shrink-0">
              <CircleDollarSign className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">Price Range</div>
              <div className="text-xl font-black text-zinc-900 dark:text-zinc-100 leading-none tracking-tight">
                {rawServices.length > 0 
                  ? `${formatKOrL(Math.min(...rawServices.map((s: Service) => s.base_price || 0)))} - ${formatKOrL(Math.max(...rawServices.map((s: Service) => s.base_price || 0)))}`
                  : '₹0'}
              </div>
              <div className="text-xs text-zinc-400 mt-1">Across all services</div>
            </div>
          </div>

          <div className="bg-violet-50/50 dark:bg-violet-900/10 border border-violet-100 dark:border-violet-900/30 rounded-xl p-5 shadow-sm mt-6">
            <h3 className="font-bold text-violet-900 dark:text-violet-100 flex items-center gap-2 mb-4">
              <Lightbulb className="w-4 h-4 text-violet-600 dark:text-violet-400" />
              Quick Tips
            </h3>
            <ul className="space-y-3 mb-5">
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" strokeWidth={3} />
                <span className="text-sm text-zinc-600 dark:text-zinc-300 leading-tight">Create services to standardize your offerings.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" strokeWidth={3} />
                <span className="text-sm text-zinc-600 dark:text-zinc-300 leading-tight">Use <strong className="text-zinc-900 dark:text-zinc-100 font-semibold">packages</strong> to bundle multiple services.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Check className="w-4 h-4 text-violet-500 flex-shrink-0 mt-0.5" strokeWidth={3} />
                <span className="text-sm text-zinc-600 dark:text-zinc-300 leading-tight">Set clear pricing and tax rates for accurate quotes.</span>
              </li>
            </ul>
          </div>

          <button
            onClick={() => setDocsOpen(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors shadow-sm"
          >
            View Documentation <ExternalLink size={14} />
          </button>
        </div>
      </div>

      {docsOpen && (
        <GuideBody
          title="How the Service Catalog Works"
          content={SERVICES_HOWTO}
          onClose={() => setDocsOpen(false)}
        />
      )}

      {serviceDeleteConfirm && (
        <div className="overlay z-50 flex items-center justify-center" onClick={() => setServiceDeleteConfirm(null)}>
          <div className="modal max-w-sm w-full shadow-xl bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Delete Service?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Are you sure you want to delete this service? This action cannot be undone and may affect existing quotes.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setServiceDeleteConfirm(null)} 
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => deleteServiceMutation.mutate(serviceDeleteConfirm)} 
                disabled={deleteServiceMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                {deleteServiceMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {packageDeleteConfirm && (
        <div className="overlay z-50 flex items-center justify-center" onClick={() => setPackageDeleteConfirm(null)}>
          <div className="modal max-w-sm w-full shadow-xl bg-white dark:bg-[#1a1a24] border border-zinc-200 dark:border-zinc-800 rounded-xl p-6 text-center" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100 mb-2">Delete Package?</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6">
              Are you sure you want to delete this package? This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-center">
              <button 
                onClick={() => setPackageDeleteConfirm(null)} 
                className="px-4 py-2 rounded-lg text-sm font-semibold border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => deletePackageMutation.mutate(packageDeleteConfirm)} 
                disabled={deletePackageMutation.isPending}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                {deletePackageMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {serviceModalOpen && (
        <ServiceFormModal
          service={editService}
          categories={categories}
          onClose={() => { setServiceModalOpen(false); setEditService(null); }}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['services'] })}
        />
      )}

      {packageModalOpen && (
        <PackageFormModal
          pkg={editPackage}
          servicesList={rawServices}
          defaultCurrencyId={defaultCurrencyId}
          onClose={() => { setPackageModalOpen(false); setEditPackage(null); }}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ['packages'] })}
        />
      )}

      {categoryModalOpen && (
        <CategoryManagerModal
          categories={categories}
          servicesList={rawServices}
          onClose={() => setCategoryModalOpen(false)}
        />
      )}
    </div>
  );
}

// ── CATEGORY MANAGER MODAL COMPONENT ───────────────────────────
function CategoryManagerModal({
  categories,
  servicesList,
  onClose,
}: {
  categories: ServiceCategory[];
  servicesList: Service[];
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['serviceCategories'] });
    queryClient.invalidateQueries({ queryKey: ['services'] });
  };

  const createMutation = useMutation({
    mutationFn: (name: string) => categoriesApi.create({ name }),
    onSuccess: () => { invalidate(); setNewName(''); showToast('Category created', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to create category.'), 'error'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => categoriesApi.update(id, { name }),
    onSuccess: () => { invalidate(); setEditingId(null); showToast('Category renamed', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to rename category.'), 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => categoriesApi.delete(id),
    onSuccess: () => { invalidate(); setDeleteConfirmId(null); showToast('Category deleted', 'success'); },
    onError: (err) => showToast(getApiErrorMessage(err, 'Failed to delete category.'), 'error'),
  });

  const countFor = (catId: number) => servicesList.filter((s: Service) => s.category_id === catId).length;

  const handleCreate = () => {
    const name = newName.trim();
    if (!name) return;
    createMutation.mutate(name);
  };

  const handleRename = () => {
    const name = editName.trim();
    if (!name || editingId === null) return;
    updateMutation.mutate({ id: editingId, name });
  };

  return (
    <div className="overlay z-50" onClick={onClose}>
      <div
        className="modal max-w-md w-full shadow-lg text-primary"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="modal-title text-lg font-bold flex items-center gap-2">
            <Tag size={16} className="text-violet-500" /> Manage Categories
          </h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon p-1 rounded">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 flex flex-col gap-4">
          {/* Create row */}
          <div className="flex gap-2">
            <input
              type="text"
              autoFocus
              placeholder="New category name…"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); }}
              className="form-input flex-1"
            />
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createMutation.isPending}
              className="btn btn-primary flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus size={15} /> {createMutation.isPending ? 'Adding…' : 'Add'}
            </button>
          </div>

          {/* Category list */}
          <div className="rounded-lg max-h-80 overflow-y-auto" style={{ border: '1px solid var(--border)' }}>
            {categories.length === 0 ? (
              <p className="text-sm text-muted text-center py-6">No categories yet — add your first one above.</p>
            ) : (
              categories.map((cat: ServiceCategory, idx: number) => {
                const style = getCategoryStyle(cat.name);
                const CatIcon = style.Icon;
                const count = countFor(cat.id);
                const isEditing = editingId === cat.id;
                const isConfirmingDelete = deleteConfirmId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className="px-3 py-2.5 flex items-center gap-3"
                    style={{ borderTop: idx > 0 ? '1px solid var(--border-subtle)' : 'none' }}
                  >
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={style.iconBgStyle}>
                      <CatIcon size={15} style={{ color: style.iconColor }} />
                    </div>

                    {isEditing ? (
                      <>
                        <input
                          type="text"
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleRename();
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          className="form-input flex-1 py-1.5 text-sm"
                        />
                        <button
                          onClick={handleRename}
                          disabled={!editName.trim() || updateMutation.isPending}
                          className="p-1.5 rounded-md text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors"
                          title="Save"
                        >
                          <Check size={15} strokeWidth={3} />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1.5 rounded-md text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                          title="Cancel"
                        >
                          <X size={15} />
                        </button>
                      </>
                    ) : isConfirmingDelete ? (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-danger block truncate">Delete “{cat.name}”?</span>
                          <span className="text-xs text-muted">
                            {count > 0 ? `${count} service${count === 1 ? '' : 's'} will move to Uncategorized.` : 'This cannot be undone.'}
                          </span>
                        </div>
                        <button
                          onClick={() => deleteMutation.mutate(cat.id)}
                          disabled={deleteMutation.isPending}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold bg-red-600 text-white hover:bg-red-700 transition-colors"
                        >
                          {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
                        </button>
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="px-2.5 py-1 rounded-md text-xs font-semibold border border-zinc-300 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold text-primary block truncate">{cat.name}</span>
                          <span className="text-xs text-muted">{count} service{count === 1 ? '' : 's'}</span>
                        </div>
                        <button
                          onClick={() => { setEditingId(cat.id); setEditName(cat.name); setDeleteConfirmId(null); }}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                          title="Rename category"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={() => { setDeleteConfirmId(cat.id); setEditingId(null); }}
                          className="p-1.5 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="Delete category"
                        >
                          <Trash2 size={14} />
                        </button>
                      </>
                    )}
                  </div>
                );
              })
            )}
          </div>

          <p className="text-xs text-muted leading-relaxed">
            Deleting a category never deletes its services — they move to the
            “Uncategorized” group, where you can reassign them by editing each service.
          </p>
        </div>
      </div>
    </div>
  );
}

interface ServiceForm {
  category_id: number;
  name: string;
  description: string;
  base_price: number;
  unit: string;
  tax_rate: number;
}

function ServiceFormModal({
  service,
  categories,
  onClose,
  onSuccess,
}: {
  service: Service | null;
  categories: ServiceCategory[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = service !== null;
  const { showToast } = useToast();

  const { data: settings } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: async () => (await platformSettings.get()).data,
  });

  const [form, setForm] = useState<ServiceForm>({
    category_id: service?.category_id || (categories[0]?.id || 1),
    name: service?.name || '',
    description: service?.description || '',
    base_price: service?.base_price || 0,
    unit: service?.unit || 'hour',
    tax_rate: service?.tax_rate !== undefined && service?.tax_rate !== null ? Number(service.tax_rate) : 18,
  });

  useEffect(() => {
    if (!isEdit && settings?.tax?.default_tax_rate !== undefined) {
      setForm(prev => {
        if (prev.tax_rate === 18) {
          return { ...prev, tax_rate: Number(settings.tax.default_tax_rate) };
        }
        return prev;
      });
    }
  }, [settings, isEdit]);

  const [errors, setErrors] = useState<Partial<Record<keyof ServiceForm, string>>>({});

  const createMutation = useMutation({
    onSuccess,
    mutationFn: (data: any) => servicesApi.create(data),
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to save service. Please try again.'), 'error');
    },
  });

  const updateMutation = useMutation({
    onSuccess,
    mutationFn: ({ id, data }: { id: number; data: any }) => servicesApi.update(id, data),
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to update service. Please try again.'), 'error');
    },
  });

  const mapUnitToBillingType = (unit: string) => {
    if (unit === 'hour') return 'hourly';
    if (unit === 'month') return 'monthly';
    if (unit === 'year') return 'yearly';
    return 'fixed';
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Partial<Record<keyof ServiceForm, string>> = {};
    if (!form.name.trim()) newErrors.name = 'Service name is required';
    if (form.base_price <= 0) newErrors.base_price = 'Base price must be greater than zero';
    if (!form.unit.trim()) newErrors.unit = 'Unit is required';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const payload = {
      category_id: form.category_id,
      name: form.name,
      description: form.description,
      default_price: form.base_price,
      currency_id: 1, // Default to INR
      billing_type: mapUnitToBillingType(form.unit),
      unit: form.unit,
      is_active: true,
      is_taxable: true,
      tax_rate: form.tax_rate,
    };

    if (isEdit) {
      updateMutation.mutate({ id: service.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="overlay z-50" onClick={onClose}>
      <div
        className="modal max-w-lg shadow-lg text-primary"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="modal-title text-lg font-bold">{isEdit ? 'Edit Service Product' : 'Add Service Product'}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon p-1 hover:bg-zinc-800 rounded">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Category selection */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 block">Service Category *</label>
            <select
              value={form.category_id}
              onChange={(e) => setForm((p: any) => ({ ...p, category_id: Number(e.target.value) }))}
              className="form-input"
            >
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Service name */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 block">Service Name *</label>
            <input
              type="text"
              placeholder="e.g. On-Page SEO Campaign"
              value={form.name}
              onChange={(e) => { setForm((p: any) => ({ ...p, name: e.target.value })); setErrors((p: any) => ({ ...p, name: undefined })); }}
              className={`form-input ${errors.name ? 'error' : ''}`}
            />
            {errors.name && <span className="text-danger text-xs mt-1 block">{errors.name}</span>}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 block">Description</label>
            <textarea
              placeholder="Detailed explanation of the deliverables, scope of work, etc."
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
              className="form-input"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Price, Unit, Tax grid */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: '1rem'
            }}
          >
            <div className="form-group">
              <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
                Base Price (INR) *
                <HelpIcon text="Pre-tax price for one unit (e.g. one hour or one month). GST is added on top when this service is quoted or invoiced." />
              </label>
              <input
                type="number"
                placeholder="25000"
                value={form.base_price || ''}
                onChange={(e) => { setForm((p: any) => ({ ...p, base_price: Number(e.target.value) })); setErrors((p: any) => ({ ...p, base_price: undefined })); }}
                className={`form-input ${errors.base_price ? 'error' : ''}`}
              />
              {errors.base_price && <span className="text-danger text-xs mt-1 block">{errors.base_price}</span>}
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
                Unit *
                <HelpIcon text="How this service is billed — per hour, per month, per project, etc. Shown next to the price on quotes." />
              </label>
              <select
                value={form.unit}
                onChange={(e) => setForm((p: any) => ({ ...p, unit: e.target.value }))}
                className="form-input"
              >
                <option value="hour">Per Hour</option>
                <option value="month">Per Month</option>
                <option value="project">Per Project</option>
                <option value="page">Per Page</option>
                <option value="post">Per Post</option>
                <option value="fixed">Fixed Rate</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
                Tax Rate (GST %)
                <HelpIcon text="GST percentage added on top of the base price. 18% is the standard rate; pick 0% only for exempt services." />
              </label>
              <select
                value={form.tax_rate}
                onChange={(e) => setForm((p: any) => ({ ...p, tax_rate: Number(e.target.value) }))}
                className="form-input"
              >
                <option value={0}>0% (Exempt)</option>
                <option value={5}>5%</option>
                <option value={12}>12%</option>
                <option value={18}>18% (Standard)</option>
                <option value={28}>28%</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>Cancel</button>
            <button
              id="service-form-submit"
              type="submit"
              className="btn btn-primary text-xs font-semibold px-4 py-2"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Service')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── PACKAGE FORM MODAL COMPONENT ────────────────────────────────
interface PackageForm {
  name: string;
  description: string;
  discount_type: 'percentage' | 'fixed';
  discount_value: number;
  service_ids: number[];
}

function PackageFormModal({
  pkg,
  servicesList,
  defaultCurrencyId,
  onClose,
  onSuccess,
}: {
  pkg: Package | null;
  servicesList: Service[];
  defaultCurrencyId: number | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEdit = pkg !== null;
  const { showToast } = useToast();
  const [form, setForm] = useState<PackageForm>({
    name: pkg?.name || '',
    description: pkg?.description || '',
    discount_type: pkg?.discount_type || 'percentage',
    discount_value: pkg?.discount_value || 0,
    service_ids: pkg?.services?.map(s => s.id) || pkg?.service_ids || [],
  });

  const [errors, setErrors] = useState<Partial<Record<keyof PackageForm, string>>>({});

  const createMutation = useMutation({
    onSuccess,
    mutationFn: (data: any) => packagesApi.create(data),
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to save package. Please try again.'), 'error');
    },
  });

  const updateMutation = useMutation({
    onSuccess,
    mutationFn: ({ id, data }: { id: number; data: any }) => packagesApi.update(id, data),
    onError: (err: any) => {
      showToast(getApiErrorMessage(err, 'Failed to update package. Please try again.'), 'error');
    },
  });

  const handleServiceToggle = (id: number) => {
    setForm(p => {
      const alreadyChecked = p.service_ids.includes(id);
      return {
        ...p,
        service_ids: alreadyChecked
          ? p.service_ids.filter(sid => sid !== id)
          : [...p.service_ids, id],
      };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Partial<Record<keyof PackageForm, string>> = {};
    if (!form.name.trim()) newErrors.name = 'Package name is required';
    if (form.discount_value < 0) newErrors.discount_value = 'Discount cannot be negative';
    if (form.service_ids.length === 0) newErrors.service_ids = 'Select at least one service';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    const selectedServices = servicesList.filter(s => form.service_ids.includes(s.id));
    const totalBase = selectedServices.reduce((sum, s) => {
      const price = s.base_price || 0;
      return sum + price;
    }, 0);

    let price = totalBase;
    if (form.discount_type === 'percentage') {
      price = totalBase * (1 - form.discount_value / 100);
    } else {
      price = Math.max(0, totalBase - form.discount_value);
    }

    const payload = {
      name: form.name,
      description: form.description,
      price,
      // The discount model persists now — a percentage package reloads as a
      // percentage instead of being rewritten as a fixed amount.
      discount_type: form.discount_type,
      discount_value: form.discount_value,
      currency_id: (pkg as any)?.currency_id ?? defaultCurrencyId ?? 1,
      billing_cycle: 'one_time',
      is_active: true,
      is_featured: false,
      services: form.service_ids.map(id => ({
        service_id: id,
        custom_price: null,
        quantity: 1,
        description: null,
      })),
    };

    if (isEdit) {
      updateMutation.mutate({ id: pkg.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div className="overlay z-50" onClick={onClose}>
      <div
        className="modal max-w-lg shadow-lg text-primary"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header px-6 py-4 flex justify-between items-center" style={{ borderBottom: '1px solid var(--border)' }}>
          <h2 className="modal-title text-lg font-bold">{isEdit ? 'Edit Bundled Package' : 'Create Bundled Package'}</h2>
          <button onClick={onClose} className="btn btn-ghost btn-icon p-1 hover:bg-zinc-800 rounded">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Package Name */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 block">Package Bundle Name *</label>
            <input
              type="text"
              placeholder="e.g. Small Business Marketing Bundle"
              value={form.name}
              onChange={(e) => { setForm((p: any) => ({ ...p, name: e.target.value })); setErrors((p: any) => ({ ...p, name: undefined })); }}
              className={`form-input ${errors.name ? 'error' : ''}`}
            />
            {errors.name && <span className="text-danger text-xs mt-1 block">{errors.name}</span>}
          </div>

          {/* Description */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 block">Description</label>
            <textarea
              placeholder="Explain the scope and pricing benefits of this bundled package."
              rows={3}
              value={form.description}
              onChange={(e) => setForm((p: any) => ({ ...p, description: e.target.value }))}
              className="form-input"
              style={{ resize: 'none' }}
            />
          </div>

          {/* Discount Type & Value */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem'
            }}
          >
            <div className="form-group">
              <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
                Discount Model
                <HelpIcon text="Take a % off or a fixed INR amount off the combined base price. Both the discount and the resulting final price are saved — reopening the package shows exactly what you set here." />
              </label>
              <select
                value={form.discount_type}
                onChange={(e) => setForm((p: any) => ({ ...p, discount_type: e.target.value as 'percentage' | 'fixed' }))}
                className="form-input"
              >
                <option value="percentage">Percentage Discount (%)</option>
                <option value="fixed">Fixed Price Discount (INR)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
                Discount Value *
                <HelpIcon text="How much to take off the total of the selected services' base prices. The resulting 'Bundled Special' price is what clients see." />
              </label>
              <input
                type="number"
                placeholder="10"
                value={form.discount_value || ''}
                onChange={(e) => { setForm((p: any) => ({ ...p, discount_value: Number(e.target.value) })); setErrors((p: any) => ({ ...p, discount_value: undefined })); }}
                className="form-input"
              />
            </div>
          </div>

          {/* Services Checklist */}
          <div className="form-group">
            <label className="form-label text-xs font-semibold text-secondary mb-1.5 flex items-center gap-1">
              Select Services to Bundle *
              <HelpIcon text="Tick every service included in this bundle. Their base prices add up to the package total before the discount." />
            </label>
            {errors.service_ids && (
              <span className="text-danger text-xs mb-2 block">{errors.service_ids}</span>
            )}
            <div
              className="rounded-lg p-3 max-h-48 overflow-y-auto"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)'
              }}
            >
              {servicesList.map((s, sIdx) => {
                const checked = form.service_ids.includes(s.id);
                const basePriceVal = s.base_price || 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => handleServiceToggle(s.id)}
                    className="flex items-center gap-3 cursor-pointer p-1.5 rounded"
                    style={{
                      borderTop: sIdx > 0 ? '1px solid var(--border-subtle)' : 'none',
                      paddingTop: sIdx > 0 ? '8px' : '4px',
                      transition: 'background var(--transition-fast)'
                    }}
                  >
                    <div
                      className="w-4 h-4 rounded border flex items-center justify-center transition-all"
                      style={{
                        backgroundColor: checked ? 'var(--accent)' : 'transparent',
                        borderColor: checked ? 'var(--accent)' : 'var(--text-muted)'
                      }}
                    >
                      <Check size={10} strokeWidth={3} style={{ color: checked ? '#ffffff' : 'transparent' }} />
                    </div>
                    <div className="flex-1">
                      <span className="text-xs font-medium text-primary">{s.name}</span>
                      <span className="text-[10px] text-muted block" style={{ display: 'block' }}>
                        {formatCurrency(basePriceVal)} / {s.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4" style={{ borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary text-xs" onClick={onClose}>Cancel</button>
            <button
              id="package-form-submit"
              type="submit"
              className="btn btn-primary text-xs font-semibold px-4 py-2"
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {createMutation.isPending || updateMutation.isPending ? 'Saving...' : (isEdit ? 'Save Changes' : 'Create Package')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
