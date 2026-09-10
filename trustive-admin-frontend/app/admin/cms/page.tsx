"use client";

import { useState, useRef, useCallback } from "react";
import {
    Plus,
    Trash2,
    Edit2,
    Image as ImageIcon,
    FileText,
    Upload,
    X,
    Eye,
    Loader2,
    Save,
    Search,
    Newspaper,
    Link as LinkIcon,
    Type,
    AlignLeft,
    PlusCircle
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api-client";
import { toast } from "react-toastify";
import { confirmAction } from "@/lib/confirm";

const API_BASE = "";

interface CmsSection {
    id: number;
    section_key: string;
    title: string | null;
    subtitle: string | null;
    description: string | null;
    image_url: string | null;
    button_text: string | null;
    button_link: string | null;
    display_order: number;
    is_active: number;
    created_at: string;
    updated_at: string;
}

interface FormData {
    section_key: string;
    title: string;
    subtitle: string;
    descriptions: string[]; // multiple paragraphs
    image: string | null | undefined; // base64 for new image, null = unchanged, "" = removed
    button_text: string;
    button_link: string;
    is_active: number;
}

const emptyForm: FormData = {
    section_key: "",
    title: "",
    subtitle: "",
    descriptions: [""],
    image: undefined, // undefined means "not changed"
    button_text: "",
    button_link: "",
    is_active: 1,
};

export default function CmsManagement() {
    const queryClient = useQueryClient();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [previewSection, setPreviewSection] = useState<CmsSection | null>(null);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [form, setForm] = useState<FormData>(emptyForm);
    const [saving, setSaving] = useState(false);
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [imageChanged, setImageChanged] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [dragActive, setDragActive] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const { data: cmsData, isLoading: loading } = useQuery({
        queryKey: ["cms-sections"],
        queryFn: () => apiRequest("/cms/sections"),
        refetchInterval: 15000,
    });

    const sections: CmsSection[] = cmsData?.sections || [];

    const filteredSections = sections.filter(s =>
        !searchQuery ||
        s.section_key.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );

    // Image handling
    const handleFileSelect = useCallback((file: File) => {
        if (!file.type.startsWith("image/")) {
            toast.error("Please select an image file");
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            toast.error("Image size must be under 10MB");
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target?.result as string;
            setForm(prev => ({ ...prev, image: base64 }));
            setImagePreview(base64);
            setImageChanged(true);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleDrag = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.type === "dragenter" || e.type === "dragover") {
            setDragActive(true);
        } else if (e.type === "dragleave") {
            setDragActive(false);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            handleFileSelect(e.dataTransfer.files[0]);
        }
    }, [handleFileSelect]);

    // Paragraph management
    const addParagraph = () => {
        setForm(prev => ({ ...prev, descriptions: [...prev.descriptions, ""] }));
    };

    const updateParagraph = (index: number, value: string) => {
        setForm(prev => {
            const newDescs = [...prev.descriptions];
            newDescs[index] = value;
            return { ...prev, descriptions: newDescs };
        });
    };

    const removeParagraph = (index: number) => {
        if (form.descriptions.length <= 1) return;
        setForm(prev => ({
            ...prev,
            descriptions: prev.descriptions.filter((_, i) => i !== index)
        }));
    };

    // Parse description string into paragraphs (split by double newline)
    const descriptionToParagraphs = (desc: string | null): string[] => {
        if (!desc) return [""];
        const paragraphs = desc.split("\n\n").filter(p => p.trim() !== "");
        return paragraphs.length > 0 ? paragraphs : [""];
    };

    // Join paragraphs back into description string
    const paragraphsToDescription = (paragraphs: string[]): string => {
        return paragraphs.filter(p => p.trim() !== "").join("\n\n");
    };

    // Modal management
    const openCreateModal = () => {
        setEditingId(null);
        setForm({ ...emptyForm, descriptions: [""] });
        setImagePreview(null);
        setImageChanged(false);
        setIsModalOpen(true);
    };

    const openEditModal = (section: CmsSection) => {
        setEditingId(section.id);
        setForm({
            section_key: section.section_key,
            title: section.title || "",
            subtitle: section.subtitle || "",
            descriptions: descriptionToParagraphs(section.description),
            image: undefined, // undefined = not changed
            button_text: section.button_text || "",
            button_link: section.button_link || "",
            is_active: section.is_active,
        });
        setImagePreview(section.image_url ? `${API_BASE}${section.image_url}` : null);
        setImageChanged(false);
        setIsModalOpen(true);
    };

    const closeModal = () => {
        setIsModalOpen(false);
        setEditingId(null);
        setForm(emptyForm);
        setImagePreview(null);
        setImageChanged(false);
    };

    // CRUD operations
    const handleSave = async () => {
        if (!form.section_key.trim()) {
            toast.error("Section key is required");
            return;
        }

        setSaving(true);
        try {
            // Build payload — only include fields that changed for updates
            const description = paragraphsToDescription(form.descriptions);

            if (editingId) {
                // For updates: only send image if it was actually changed
                const payload: any = {
                    section_key: form.section_key,
                    title: form.title,
                    subtitle: form.subtitle,
                    description,
                    button_text: form.button_text,
                    button_link: form.button_link,
                    is_active: form.is_active,
                };

                // Only include image field if admin explicitly changed/removed it
                if (imageChanged) {
                    payload.image = form.image ?? ""; // "" means remove, base64 means new image
                }

                const data = await apiRequest(`/cms/sections/update/${editingId}`, {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                if (data.status) {
                    toast.success("Section updated successfully");
                    queryClient.invalidateQueries({ queryKey: ["cms-sections"] });
                    closeModal();
                } else {
                    toast.error(data.msg || "Failed to update section");
                }
            } else {
                // For create: include everything
                const payload: any = {
                    section_key: form.section_key,
                    title: form.title,
                    subtitle: form.subtitle,
                    description,
                    image: form.image || null,
                    button_text: form.button_text,
                    button_link: form.button_link,
                    is_active: form.is_active,
                };

                const data = await apiRequest("/cms/sections", {
                    method: "POST",
                    body: JSON.stringify(payload),
                });
                if (data.status) {
                    toast.success("Section created successfully");
                    queryClient.invalidateQueries({ queryKey: ["cms-sections"] });
                    closeModal();
                } else {
                    toast.error(data.msg || "Failed to create section");
                }
            }
        } catch (err: any) {
            toast.error(err.message || "Operation failed");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (section: CmsSection) => {
        const confirmed = await confirmAction(`Are you sure you want to delete "${section.section_key}"? This action cannot be undone.`);
        if (!confirmed) return;

        try {
            const data = await apiRequest(`/cms/sections/delete/${section.id}`, {
                method: "POST",
            });
            if (data.status) {
                toast.success("Section deleted");
                queryClient.invalidateQueries({ queryKey: ["cms-sections"] });
            } else {
                toast.error(data.msg || "Failed to delete");
            }
        } catch (err) {
            toast.error("Failed to delete section");
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent"></div>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-700">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-zinc-900 tracking-tight flex items-center gap-3">
                        <div className="p-2 bg-[#212E73]/10 rounded-lg">
                            <Newspaper className="w-6 h-6 text-[#212E73]" />
                        </div>
                        Content Management
                    </h1>
                    <p className="text-zinc-500 text-sm mt-1">
                        Manage landing page sections — images, headers, and descriptions.
                    </p>
                </div>
                <button
                    onClick={openCreateModal}
                    className="flex items-center gap-2 px-6 py-3 bg-[#212E73] hover:bg-[#1a255c] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-md cursor-pointer"
                >
                    <Plus className="w-4 h-4" />
                    New Section
                </button>
            </div>

            {/* Search */}
            <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
                <input
                    type="text"
                    placeholder="Search sections..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-white border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] rounded-xl pl-11 pr-4 py-3 text-zinc-900 text-sm focus:border-[#212E73] outline-none transition-colors"
                />
            </div>

            {/* Sections Grid */}
            {filteredSections.length === 0 ? (
                <div className="bg-white rounded-[32px] border border-zinc-200/90 shadow-[0_4px_20px_rgba(0,0,0,0.03)] p-16 text-center">
                    <div className="w-20 h-20 bg-zinc-100 rounded-3xl flex items-center justify-center mx-auto mb-6">
                        <FileText className="w-10 h-10 text-zinc-400" />
                    </div>
                    <h3 className="text-xl font-bold text-zinc-900 mb-2">No Sections Found</h3>
                    <p className="text-zinc-500 text-sm mb-8">
                        {searchQuery ? "No sections match your search." : "Create your first CMS section to get started."}
                    </p>
                    {!searchQuery && (
                        <button
                            onClick={openCreateModal}
                            className="inline-flex items-center gap-2 px-8 py-3 bg-[#212E73] hover:bg-[#1a255c] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-md cursor-pointer"
                        >
                            <Plus className="w-4 h-4" />
                            Create Section
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                    {filteredSections.map((section) => (
                        <div
                            key={section.id}
                            className={cn(
                                "bg-white rounded-[24px] border overflow-hidden transition-all hover:shadow-lg group shadow-[0_4px_20px_rgba(0,0,0,0.03)]",
                                section.is_active ? "border-zinc-200/90" : "border-red-200 opacity-60"
                            )}
                        >
                            {/* Image Preview */}
                            <div className="relative h-48 bg-zinc-100 overflow-hidden">
                                {section.image_url ? (
                                    <img
                                        src={`${API_BASE}${section.image_url}`}
                                        alt={section.title || section.section_key}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                                    />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center">
                                        <ImageIcon className="w-12 h-12 text-zinc-400" />
                                    </div>
                                )}

                                {/* Status Badge */}
                                <div className="absolute top-3 left-3">
                                    <span className={cn(
                                        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider backdrop-blur-sm",
                                        section.is_active
                                            ? "bg-green-50 text-green-700 border border-green-200"
                                            : "bg-red-50 text-red-700 border border-red-200"
                                    )}>
                                        <span className={cn("w-1.5 h-1.5 rounded-full", section.is_active ? "bg-green-500" : "bg-red-500")} />
                                        {section.is_active ? "Active" : "Hidden"}
                                    </span>
                                </div>

                                {/* Action Overlay */}
                                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                                    <button
                                        onClick={() => openEditModal(section)}
                                        className="p-3 bg-[#212E73] rounded-xl text-white hover:scale-110 transition-transform cursor-pointer"
                                        title="Edit"
                                    >
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPreviewSection(section)}
                                        className="p-3 bg-white rounded-xl text-zinc-900 hover:scale-110 transition-transform cursor-pointer"
                                        title="Preview"
                                    >
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => handleDelete(section)}
                                        className="p-3 bg-red-600 rounded-xl text-white hover:scale-110 transition-transform cursor-pointer"
                                        title="Delete"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>

                            {/* Content */}
                            <div className="p-5 space-y-3">
                                <div>
                                    <p className="text-[10px] font-black text-[#212E73] uppercase tracking-widest mb-1">{section.section_key}</p>
                                    <h3 className="text-zinc-900 font-bold text-sm truncate">{section.title || "Untitled"}</h3>
                                    {section.subtitle && (
                                        <p className="text-zinc-500 text-xs mt-0.5 truncate">{section.subtitle}</p>
                                    )}
                                </div>
                                {section.description && (
                                    <p className="text-zinc-600 text-xs line-clamp-2 leading-relaxed">{section.description}</p>
                                )}
                                {section.button_text && (
                                    <div className="flex items-center gap-2 text-xs text-[#212E73] font-medium">
                                        <LinkIcon className="w-3 h-3" />
                                        <span className="truncate">{section.button_text}</span>
                                    </div>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Preview Modal */}
            {previewSection && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPreviewSection(null)} />
                    <div className="relative bg-white border border-zinc-200/90 rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                        {/* Preview Header */}
                        <div className="shrink-0 bg-white border-b border-zinc-100 px-8 py-6 flex items-center justify-between rounded-t-[32px]">
                            <div>
                                <h2 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
                                    <Eye className="w-5 h-5 text-[#212E73]" />
                                    Section Preview
                                </h2>
                                <p className="text-[#212E73] text-xs font-mono mt-1 font-bold">{previewSection.section_key}</p>
                            </div>
                            <button
                                onClick={() => setPreviewSection(null)}
                                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5 text-zinc-500" />
                            </button>
                        </div>

                        {/* Circular Image */}
                        {previewSection.image_url && (
                            <div className="shrink-0 border-b border-zinc-100 py-6 flex justify-center bg-zinc-50/50">
                                <img
                                    src={`${API_BASE}${previewSection.image_url}`}
                                    alt={previewSection.title || "Preview"}
                                    className="w-48 h-48 rounded-full object-cover border-4 border-[#212E73]/20 shadow-md"
                                />
                            </div>
                        )}

                        {/* Scrollable Content */}
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-8 space-y-6">
                            {/* Title & Subtitle */}
                            {previewSection.title && (
                                <h3 className="text-2xl font-bold text-zinc-900">{previewSection.title}</h3>
                            )}
                            {previewSection.subtitle && (
                                <p className="text-zinc-500 text-sm -mt-3">{previewSection.subtitle}</p>
                            )}

                            {/* Description - render paragraphs */}
                            {previewSection.description && (
                                <div className="space-y-4">
                                    {previewSection.description.split("\n\n").map((para, i) => (
                                        <p key={i} className="text-zinc-700 text-sm leading-relaxed">{para}</p>
                                    ))}
                                </div>
                            )}

                            {/* Button - show if either button_text or button_link exists */}
                            {(previewSection.button_text || previewSection.button_link) && (
                                <div className="pt-2 space-y-2">
                                    <a
                                        href={previewSection.button_link || "#"}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 px-6 py-3 bg-[#212E73] hover:bg-[#1a255c] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-md"
                                    >
                                        <LinkIcon className="w-3.5 h-3.5" />
                                        {previewSection.button_text || "Visit Link"}
                                    </a>
                                    {previewSection.button_link && (
                                        <p className="text-zinc-500 text-[10px] font-mono truncate px-1">{previewSection.button_link}</p>
                                    )}
                                </div>
                            )}

                            {/* Status info */}
                            <div className="pt-4 border-t border-zinc-100 flex items-center gap-4 text-xs text-zinc-500">
                                <span className={cn(
                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold",
                                    previewSection.is_active
                                        ? "bg-green-50 text-green-700 border border-green-200"
                                        : "bg-red-50 text-red-700 border border-red-200"
                                    )}>
                                    <span className={cn("w-1.5 h-1.5 rounded-full", previewSection.is_active ? "bg-green-500" : "bg-red-500")} />
                                    {previewSection.is_active ? "Active" : "Hidden"}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Create/Edit Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeModal} />
                    <div className="relative bg-white border border-zinc-200/90 rounded-[32px] w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl custom-scrollbar">
                        {/* Modal Header */}
                        <div className="sticky top-0 z-10 bg-white border-b border-zinc-100 px-8 py-6 flex items-center justify-between rounded-t-[32px]">
                            <div>
                                <h2 className="text-xl font-bold text-zinc-900">
                                    {editingId ? "Edit Section" : "Create New Section"}
                                </h2>
                                <p className="text-zinc-500 text-xs mt-1">
                                    {editingId ? "Update the section content below." : "Fill in the details for the new section."}
                                </p>
                            </div>
                            <button
                                onClick={closeModal}
                                className="p-2 hover:bg-zinc-100 rounded-xl transition-colors cursor-pointer"
                            >
                                <X className="w-5 h-5 text-zinc-500" />
                            </button>
                        </div>

                        {/* Modal Body */}
                        <div className="p-8 space-y-6">
                            {/* Section Key */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <FileText className="w-3 h-3" /> Section Key *
                                </label>
                                <input
                                    type="text"
                                    value={form.section_key}
                                    onChange={(e) => setForm(prev => ({ ...prev, section_key: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase() }))}
                                    placeholder="e.g. hero_banner, about_us, features"
                                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none font-mono text-sm"
                                />
                                <p className="text-zinc-500 text-[10px] px-1">Unique identifier for this section. Only lowercase letters, numbers, underscores.</p>
                            </div>

                            {/* Title & Subtitle */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                        <Type className="w-3 h-3" /> Title / Header
                                    </label>
                                    <input
                                        type="text"
                                        value={form.title}
                                        onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
                                        placeholder="Section heading"
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Subtitle</label>
                                    <input
                                        type="text"
                                        value={form.subtitle}
                                        onChange={(e) => setForm(prev => ({ ...prev, subtitle: e.target.value }))}
                                        placeholder="Optional subtitle"
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Description - Multiple Paragraphs */}
                            <div className="space-y-3">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <AlignLeft className="w-3 h-3" /> Description
                                </label>
                                {form.descriptions.map((para, index) => (
                                    <div key={index} className="relative group/para">
                                        <div className="flex items-start gap-2">
                                            <span className="text-[10px] text-zinc-500 font-bold mt-3.5 min-w-[20px]">P{index + 1}</span>
                                            <textarea
                                                value={para}
                                                onChange={(e) => updateParagraph(index, e.target.value)}
                                                placeholder={`Paragraph ${index + 1}...`}
                                                rows={3}
                                                className="flex-1 bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none text-sm resize-none"
                                            />
                                            {form.descriptions.length > 1 && (
                                                <button
                                                    type="button"
                                                    onClick={() => removeParagraph(index)}
                                                    className="p-2 mt-1 text-zinc-400 hover:text-red-500 transition-colors cursor-pointer"
                                                    title="Remove paragraph"
                                                >
                                                    <X className="w-4 h-4" />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                ))}
                                <button
                                    type="button"
                                    onClick={addParagraph}
                                    className="flex items-center gap-2 px-4 py-2.5 bg-zinc-100 border border-zinc-200 rounded-xl text-zinc-700 hover:text-[#212E73] hover:border-[#212E73]/30 transition-all text-xs font-bold cursor-pointer"
                                >
                                    <PlusCircle className="w-4 h-4" />
                                    Add Paragraph
                                </button>
                            </div>

                            {/* Image Upload */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                    <ImageIcon className="w-3 h-3" /> Image
                                </label>
                                <div
                                    onDragEnter={handleDrag}
                                    onDragLeave={handleDrag}
                                    onDragOver={handleDrag}
                                    onDrop={handleDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                    className={cn(
                                        "relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all",
                                        dragActive
                                            ? "border-[#212E73] bg-[#212E73]/5"
                                            : "border-zinc-300 hover:border-zinc-400 bg-zinc-50"
                                    )}
                                >
                                    {imagePreview ? (
                                        <div className="relative">
                                            <img
                                                src={imagePreview}
                                                alt="Preview"
                                                className="max-h-48 mx-auto rounded-xl object-contain"
                                            />
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setForm(prev => ({ ...prev, image: "" }));
                                                    setImagePreview(null);
                                                    setImageChanged(true);
                                                }}
                                                className="absolute -top-2 -right-2 p-1.5 bg-red-500 rounded-full text-white hover:scale-110 transition-transform cursor-pointer"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="py-4">
                                            <Upload className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
                                            <p className="text-sm text-zinc-600 font-medium">
                                                Drop an image here or <span className="text-[#212E73] font-bold">browse</span>
                                            </p>
                                            <p className="text-[10px] text-zinc-400 mt-1">PNG, JPG, WebP up to 10MB</p>
                                        </div>
                                    )}
                                    <input
                                        ref={fileInputRef}
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                            if (e.target.files?.[0]) handleFileSelect(e.target.files[0]);
                                        }}
                                    />
                                </div>
                            </div>

                            {/* Button Settings */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1 flex items-center gap-2">
                                        <LinkIcon className="w-3 h-3" /> Button Text
                                    </label>
                                    <input
                                        type="text"
                                        value={form.button_text}
                                        onChange={(e) => setForm(prev => ({ ...prev, button_text: e.target.value }))}
                                        placeholder="e.g. Learn More"
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none text-sm"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Button Link</label>
                                    <input
                                        type="text"
                                        value={form.button_link}
                                        onChange={(e) => setForm(prev => ({ ...prev, button_link: e.target.value }))}
                                        placeholder="https://..."
                                        className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 focus:border-[#212E73] focus:bg-white outline-none text-sm"
                                    />
                                </div>
                            </div>

                            {/* Visibility Toggle */}
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest px-1">Visibility</label>
                                <button
                                    type="button"
                                    onClick={() => setForm(prev => ({ ...prev, is_active: prev.is_active ? 0 : 1 }))}
                                    className={cn(
                                        "w-full flex items-center justify-center gap-3 px-4 py-3 rounded-xl border font-bold text-sm transition-all cursor-pointer",
                                        form.is_active
                                            ? "bg-green-50 border-green-200 text-green-700"
                                            : "bg-red-50 border-red-200 text-red-700"
                                    )}
                                >
                                    {form.is_active ? <Eye className="w-4 h-4" /> : <X className="w-4 h-4" />}
                                    {form.is_active ? "Visible (Active)" : "Hidden (Inactive)"}
                                </button>
                            </div>
                        </div>

                        {/* Modal Footer */}
                        <div className="sticky bottom-0 bg-white border-t border-zinc-100 px-8 py-5 flex items-center justify-end gap-4 rounded-b-[32px]">
                            <button
                                onClick={closeModal}
                                className="px-6 py-3 bg-zinc-100 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={saving}
                                className="px-10 py-3 bg-[#212E73] hover:bg-[#1a255c] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-md flex items-center gap-3 cursor-pointer"
                            >
                                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                                {editingId ? "Update Section" : "Create Section"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
