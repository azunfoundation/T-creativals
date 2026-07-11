'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { services as servicesApi, serviceCategories as categoriesApi, packages as packagesApi, platformSettings, getApiErrorMessage } from '@/lib/api';
import type { Service, ServiceCategory, Package } from '@/lib/api';
import { Plus, Edit2, Trash2, X, Package as PackageIcon, Percent, Layers, Tag, Check, HelpCircle, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/store/auth';
import { formatCurrency } from '@/lib/utils';
import { useToast } from '@/hooks/useToast';
import { HelpIcon } from '@/components/ui/HelpIcon';
import { HowToUseGuide } from '@/components/ui/HowToUseGuide';

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
        'The discount saves exactly as you set it \u2014 a 15% discount still reads 15% when you reopen the package.',
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

export default function ServicesPage() {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuthStore();
  // services.manage is what the backend checks on every create/edit/delete —
  // without it the buttons would only ever 403.
  const canManage = (user?.permissions || []).includes('services.manage');
  const [activeTab, setActiveTab] = useState<'services' | 'packages'>('services');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<number | 'all'>('all');

  // Modals state
  const [serviceModalOpen, setServiceModalOpen] = useState(false);
  const [editService, setEditService] = useState<Service | null>(null);
  const [serviceDeleteConfirm, setServiceDeleteConfirm] = useState<number | null>(null);

  const [packageModalOpen, setPackageModalOpen] = useState(false);
  const [editPackage, setEditPackage] = useState<Package | null>(null);
  const [packageDeleteConfirm, setPackageDeleteConfirm] = useState<number | null>(null);

  // Queries
  const { data: categories = [], isError: isCategoriesError } = useQuery<ServiceCategory[]>({
    queryKey: ['service-categories'],
    queryFn: async () => {
      const res = await categoriesApi.list();
      return res.data || [];
    },
  });

  const { data: rawServices = [], isError: isServicesError } = useQuery<Service[]>({
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

  // Default currency for new packages — the platform's configured default,
  // not a hardcoded id guess.
  const { data: settings } = useQuery({
    queryKey: ['platform_settings'],
    queryFn: async () => (await platformSettings.get()).data,
  });
  const defaultCurrencyId = (settings?.currencies || []).find(c => c.is_default)?.id
    ?? (settings?.currencies || [])[0]?.id
    ?? null;

  const { data: packagesList = [], isError: isPackagesError } = useQuery<Package[]>({
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
        // Discounts persist for real now; rows saved before that carry a
        // NULL discount_type, for which we derive a fixed-amount display.
        const hasStoredDiscount = pkg.discount_type === 'percentage' || pkg.discount_type === 'fixed';
        return {
          ...pkg,
          services,
          discount_type: hasStoredDiscount ? pkg.discount_type : 'fixed',
          discount_value: hasStoredDiscount ? Number(pkg.discount_value || 0) : Math.max(0, totalBase - finalPrice),
        };
      });
    },
  });

  const loadError = isCategoriesError || isServicesError || isPackagesError;

  // Service Mutations
  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => servicesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['services'] });
      setServiceDeleteConfirm(null);
    },
    onError: (err: any) => {
      setServiceDeleteConfirm(null);
      showToast(getApiErrorMessage(err, 'Failed to delete service.'), 'error');
    },
  });

  // Package Mutations
  const deletePackageMutation = useMutation({
    mutationFn: (id: number) => packagesApi.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['packages'] });
      setPackageDeleteConfirm(null);
    },
    onError: (err: any) => {
      setPackageDeleteConfirm(null);
      showToast(getApiErrorMessage(err, 'Failed to delete package.'), 'error');
    },
  });

  // Filter services by category
  const filteredServices = selectedCategoryFilter === 'all'
    ? rawServices
    : rawServices.filter(s => s.category_id === selectedCategoryFilter);

  // Group services by category for render
  const servicesByCategory = categories.map(cat => ({
    ...cat,
    services: rawServices.filter(s => s.category_id === cat.id),
  })).filter(cat => selectedCategoryFilter === 'all' || cat.id === selectedCategoryFilter);

  return (
    <div className="max-w-[1400px] mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2">
            <PackageIcon className="text-violet-500 w-6 h-6" />
            Service Catalog & Packages
            <HelpIcon title="Service Catalog & Packages" content={{
              what: 'Your master price list — every service you sell and every bundled package, with base prices, billing units, and GST rates.',
              why: 'Quotes and invoices pull their line items from this catalog, so what you set here is what clients get charged.',
              when: 'Set it up once, then update whenever you add an offering or change a rate.',
            }} />
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Manage your service lines, pricing models, and client bundled packages.
          </p>
        </div>
        <div className="flex gap-2">
          <HowToUseGuide moduleKey="services" title="How the Service Catalog Works" content={SERVICES_HOWTO} />
          {canManage && (activeTab === 'services' ? (
            <button
              id="new-service-btn"
              onClick={() => { setEditService(null); setServiceModalOpen(true); }}
              className="btn btn-primary flex items-center gap-1.5"
            >
              <Plus size={16} /> New Service
            </button>
          ) : (
            <button
              id="new-package-btn"
              onClick={() => { setEditPackage(null); setPackageModalOpen(true); }}
              className="btn btn-primary flex items-center gap-1.5"
            >
              <Plus size={16} /> New Package
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.5rem',
          background: 'var(--danger-subtle)', border: '1px solid var(--danger)', color: 'var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '0.75rem 1rem', fontSize: '0.8125rem',
        }}>
          <AlertCircle size={16} />
          Couldn't load part of the catalog. What you see below may be incomplete — refresh to retry.
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('services')}
          style={{
            padding: '0.75rem 0.5rem',
            borderBottom: activeTab === 'services' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'services' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'services' ? 600 : 500,
            fontSize: '0.875rem',
            transition: 'all var(--transition-fast)'
          }}
        >
          Services by Category
        </button>
        <button
          onClick={() => setActiveTab('packages')}
          style={{
            padding: '0.75rem 0.5rem',
            borderBottom: activeTab === 'packages' ? '2px solid var(--accent)' : '2px solid transparent',
            color: activeTab === 'packages' ? 'var(--text-primary)' : 'var(--text-secondary)',
            fontWeight: activeTab === 'packages' ? 600 : 500,
            fontSize: '0.875rem',
            transition: 'all var(--transition-fast)'
          }}
        >
          Bundled Packages
        </button>
      </div>

      {/* Tab: Services */}
      {activeTab === 'services' && (
        <div className="space-y-6 flex flex-col gap-4">
          {/* Category Quick Filter */}
          <div className="flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-muted uppercase tracking-wider mr-2">Filter Category:</span>
            <button
              onClick={() => setSelectedCategoryFilter('all')}
              className="px-3 py-1 rounded-full text-xs font-medium"
              style={{
                backgroundColor: selectedCategoryFilter === 'all' ? 'var(--accent)' : 'var(--surface-elevated)',
                color: selectedCategoryFilter === 'all' ? '#ffffff' : 'var(--text-secondary)',
                border: '1px solid var(--border)',
                transition: 'all var(--transition-fast)'
              }}
            >
              All Categories
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className="px-3 py-1 rounded-full text-xs font-medium"
                style={{
                  backgroundColor: selectedCategoryFilter === cat.id ? 'var(--accent)' : 'var(--surface-elevated)',
                  color: selectedCategoryFilter === cat.id ? '#ffffff' : 'var(--text-secondary)',
                  border: '1px solid var(--border)',
                  transition: 'all var(--transition-fast)'
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>

          {/* Grids per category */}
          <div className="space-y-8 flex flex-col gap-6">
            {servicesByCategory.map((cat) => (
              <div key={cat.id} className="space-y-3 flex flex-col gap-2">
                <div className="border-b pb-2">
                  <h2 className="text-lg font-bold text-primary tracking-tight">{cat.name}</h2>
                  {cat.description && <p className="text-xs text-muted">{cat.description}</p>}
                </div>

                {cat.services.length === 0 ? (
                  <div
                    className="p-6 rounded-lg text-center text-muted text-sm"
                    style={{
                      background: 'var(--surface-elevated)',
                      border: '1px dashed var(--border)'
                    }}
                  >
                    No services configured in this category.
                  </div>
                ) : (
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
                      gap: '1rem'
                    }}
                  >
                    {cat.services.map((service) => (
                      <div
                        key={service.id}
                        className="group relative p-5 rounded-lg shadow flex flex-col justify-between"
                        style={{
                          background: 'var(--surface)',
                          border: '1px solid var(--border)',
                          transition: 'all var(--transition-fast)',
                          minHeight: '180px'
                        }}
                      >
                        <div className="space-y-2 flex flex-col gap-1.5">
                          <div className="flex justify-between items-start gap-2">
                            <h3 className="font-semibold text-primary">
                              {service.name}
                            </h3>
                            <span
                              className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded"
                              style={{
                                background: 'var(--surface-elevated)',
                                color: 'var(--text-secondary)',
                                border: '1px solid var(--border)'
                              }}
                            >
                              {service.unit}
                            </span>
                          </div>
                          {service.description && (
                            <p className="text-xs text-secondary leading-relaxed line-clamp-3">
                              {service.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-4 pt-4 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}>
                          <div>
                            <span className="text-[10px] text-muted block">Base Price</span>
                            <span className="text-base font-bold text-primary">
                              {formatCurrency(service.base_price)}
                            </span>
                          </div>
                          <div className="text-right">
                            <span className="text-[10px] text-muted block">Tax Rate</span>
                            <span className="text-xs font-semibold text-secondary">{service.tax_rate}% GST</span>
                          </div>
                        </div>

                        {/* Card Hover Actions */}
                        <div className="card-actions">
                          {canManage && (<>
                          <button
                            id={`edit-service-${service.id}`}
                            onClick={() => { setEditService(service); setServiceModalOpen(true); }}
                            className="p-1 rounded text-secondary hover:text-accent"
                            style={{
                              background: 'var(--surface-elevated)',
                              border: '1px solid var(--border)',
                              padding: '6px'
                            }}
                            title="Edit Service"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            id={`delete-service-${service.id}`}
                            onClick={() => setServiceDeleteConfirm(service.id)}
                            className="p-1 rounded text-secondary hover:text-danger"
                            style={{
                              background: 'var(--surface-elevated)',
                              border: '1px solid var(--border)',
                              padding: '6px'
                            }}
                            title="Delete Service"
                          >
                            <Trash2 size={13} />
                          </button>
                          </>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab: Bundled Packages */}
      {activeTab === 'packages' && (
        <div className="space-y-6 flex flex-col gap-4">
          {packagesList.length === 0 ? (
            <div
              className="p-12 rounded-lg text-center flex flex-col items-center justify-center gap-2"
              style={{
                background: 'var(--surface-elevated)',
                border: '1px solid var(--border)'
              }}
            >
              <Layers size={40} className="text-muted" />
              <p className="text-primary font-medium">No bundled packages configured</p>
              <p className="text-xs text-muted">Create bundle offers by combining multiple service products with automated pricing discounts.</p>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(400px, 1fr))',
                gap: '1.5rem'
              }}
            >
              {packagesList.map((pkg) => {
                const totalBase = (pkg.services || []).reduce((sum, s) => sum + s.base_price, 0);
                const discountText = pkg.discount_type === 'percentage'
                  ? `${pkg.discount_value}% Off`
                  : `${formatCurrency(pkg.discount_value)} Off`;
                // The stored final price is the source of truth — the
                // discount fields describe how it was arrived at.
                const finalVal = (pkg as any).price !== undefined
                  ? Number((pkg as any).price)
                  : (pkg.discount_type === 'percentage'
                      ? totalBase * (1 - pkg.discount_value / 100)
                      : Math.max(0, totalBase - pkg.discount_value));

                return (
                  <div
                    key={pkg.id}
                    className="group relative p-6 rounded-lg shadow flex flex-col justify-between"
                    style={{
                      background: 'var(--surface)',
                      border: '1px solid var(--border)',
                      transition: 'all var(--transition-fast)',
                      gap: '1.25rem'
                    }}
                  >
                    <div className="space-y-3 flex flex-col gap-2">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h3 className="text-lg font-bold text-primary">
                            {pkg.name}
                          </h3>
                          <span
                            className="inline-flex items-center gap-1 text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5 mt-1.5 rounded-full"
                            style={{
                              background: 'var(--accent-subtle)',
                              color: 'var(--accent)',
                              border: '1px solid var(--border)'
                            }}
                          >
                            <Tag size={10} /> {discountText}
                          </span>
                        </div>
                        <div className="pkg-actions">
                          {canManage && (<>
                          <button
                            id={`edit-pkg-${pkg.id}`}
                            onClick={() => { setEditPackage(pkg); setPackageModalOpen(true); }}
                            className="p-1 rounded text-secondary hover:text-accent"
                            style={{
                              background: 'var(--surface-elevated)',
                              border: '1px solid var(--border)',
                              padding: '6px'
                            }}
                            title="Edit Package"
                          >
                            <Edit2 size={13} />
                          </button>
                          <button
                            id={`delete-pkg-${pkg.id}`}
                            onClick={() => setPackageDeleteConfirm(pkg.id)}
                            className="p-1 rounded text-secondary hover:text-danger"
                            style={{
                              background: 'var(--surface-elevated)',
                              border: '1px solid var(--border)',
                              padding: '6px'
                            }}
                            title="Delete Package"
                          >
                            <Trash2 size={13} />
                          </button>
                          </>)}
                        </div>
                      </div>

                      {pkg.description && (
                        <p className="text-sm text-secondary leading-relaxed">
                          {pkg.description}
                        </p>
                      )}

                      {/* Included Services list */}
                      <div className="space-y-2 pt-2 flex flex-col gap-1.5">
                        <span className="text-xs font-semibold text-muted uppercase tracking-wider block">
                          Included Services ({pkg.services?.length || 0}):
                        </span>
                        <div
                          className="rounded-lg overflow-hidden"
                          style={{
                            background: 'var(--background)',
                            border: '1px solid var(--border)'
                          }}
                        >
                          {pkg.services?.map((s, sIdx) => (
                            <div
                              key={s.id}
                              className="flex justify-between items-center p-2.5 text-xs"
                              style={{
                                borderTop: sIdx > 0 ? '1px solid var(--border-subtle)' : 'none'
                              }}
                            >
                              <span className="text-primary font-medium">{s.name}</span>
                              <span className="text-secondary">{formatCurrency(s.base_price)} / {s.unit}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Cost Summary Box */}
                    <div
                      className="p-4 rounded-lg flex items-center justify-between"
                      style={{
                        background: 'var(--surface-elevated)',
                        border: '1px solid var(--border)'
                      }}
                    >
                      <div className="space-y-0.5">
                        <span className="text-[10px] text-muted block">Total Base Price</span>
                        <span className="text-sm text-secondary line-through">
                          {formatCurrency(totalBase)}
                        </span>
                      </div>
                      <div className="text-right space-y-0.5">
                        <span className="text-xs text-accent font-medium block">Bundled Special</span>
                        <span className="text-lg font-extrabold text-primary">
                          {formatCurrency(finalVal)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── SERVICE ADD/EDIT MODAL ── */}
      {serviceModalOpen && (
        <ServiceFormModal
          service={editService}
          categories={categories}
          onClose={() => setServiceModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['services'] });
            setServiceModalOpen(false);
          }}
        />
      )}

      {/* ── SERVICE DELETE CONFIRMATION ── */}
      {serviceDeleteConfirm !== null && (
        <div className="overlay z-50">
          <div className="modal max-w-sm bg-zinc-950 border border-zinc-800 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Delete Service Line?</h3>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Are you sure you want to delete this service? It will be removed from the catalog. Existing quotes containing this service will not be affected.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn btn-secondary text-xs" onClick={() => setServiceDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn btn-danger text-xs font-semibold px-4 py-2"
                onClick={() => deleteServiceMutation.mutate(serviceDeleteConfirm)}
                disabled={deleteServiceMutation.isPending}
              >
                {deleteServiceMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── PACKAGE ADD/EDIT MODAL ── */}
      {packageModalOpen && (
        <PackageFormModal
          pkg={editPackage}
          servicesList={rawServices}
          defaultCurrencyId={defaultCurrencyId}
          onClose={() => setPackageModalOpen(false)}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['packages'] });
            setPackageModalOpen(false);
          }}
        />
      )}

      {/* ── PACKAGE DELETE CONFIRMATION ── */}
      {packageDeleteConfirm !== null && (
        <div className="overlay z-50">
          <div className="modal max-w-sm bg-zinc-950 border border-zinc-800 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-zinc-100 mb-2">Delete Bundled Package?</h3>
            <p className="text-sm text-zinc-400 mb-6 leading-relaxed">
              Are you sure you want to delete this package? It will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button className="btn btn-secondary text-xs" onClick={() => setPackageDeleteConfirm(null)}>Cancel</button>
              <button
                className="btn btn-danger text-xs font-semibold px-4 py-2"
                onClick={() => deletePackageMutation.mutate(packageDeleteConfirm)}
                disabled={deletePackageMutation.isPending}
              >
                {deletePackageMutation.isPending ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── SERVICE FORM MODAL COMPONENT ────────────────────────────────
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
  const [form, setForm] = useState<ServiceForm>({
    category_id: service?.category_id || (categories[0]?.id || 1),
    name: service?.name || '',
    description: service?.description || '',
    base_price: service?.base_price || 0,
    unit: service?.unit || 'hour',
    tax_rate: service?.tax_rate ?? 18,
  });

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
              onChange={(e) => setForm(p => ({ ...p, category_id: Number(e.target.value) }))}
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
              onChange={(e) => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: undefined })); }}
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
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
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
                onChange={(e) => { setForm(p => ({ ...p, base_price: Number(e.target.value) })); setErrors(p => ({ ...p, base_price: undefined })); }}
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
                onChange={(e) => setForm(p => ({ ...p, unit: e.target.value }))}
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
                onChange={(e) => setForm(p => ({ ...p, tax_rate: Number(e.target.value) }))}
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
              onChange={(e) => { setForm(p => ({ ...p, name: e.target.value })); setErrors(p => ({ ...p, name: undefined })); }}
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
              onChange={(e) => setForm(p => ({ ...p, description: e.target.value }))}
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
                onChange={(e) => setForm(p => ({ ...p, discount_type: e.target.value as 'percentage' | 'fixed' }))}
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
                onChange={(e) => { setForm(p => ({ ...p, discount_value: Number(e.target.value) })); setErrors(p => ({ ...p, discount_value: undefined })); }}
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
