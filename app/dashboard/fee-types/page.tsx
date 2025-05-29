// sfms/app/dashboard/fee-types/page.tsx
'use client';

import React, { useEffect, useState, useCallback, Fragment } from 'react';
import toast from 'react-hot-toast';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { useAuth } from '@/components/AuthContext';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PlusCircleIcon, PencilSquareIcon, TrashIcon, DocumentDuplicateIcon, CogIcon } from '@heroicons/react/24/outline';
import { useRouter } from 'next/navigation';

type Class = Database['public']['Tables']['classes']['Row'];
type FeeType = Database['public']['Tables']['fee_types']['Row'] & {
  classes?: Partial<Class>[];
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const daysInMonth = (month: number, year: number) => {
  return new Date(year, month + 1, 0).getDate();
};

export default function FeeTypeManagement() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const {
    user,
    schoolId,
    isLoading: authLoading,
    isSchoolInfoLoading,
  } = useAuth();

  const [classes, setClasses] = useState<Class[]>([]);
  const [feeTypes, setFeeTypes] = useState<FeeType[]>([]);

  const [isPageLoading, setIsPageLoading] = useState(true);
  const [isClassesLoading, setIsClassesLoading] = useState(false);
  const [isFeeTypesLoading, setIsFeeTypesLoading] = useState(false);
  const [isSubmittingFee, setIsSubmittingFee] = useState(false);

  const [showManageClassesModal, setShowManageClassesModal] = useState(false);
  const [newClassName, setNewClassName] = useState('');

  const currentMonthString = String(new Date().getMonth());
  const currentYearString = String(new Date().getFullYear());

  const [showCreateFeeModal, setShowCreateFeeModal] = useState(false);
  const [createFeeForm, setCreateFeeForm] = useState({
    name: '',
    description: '',
    default_amount: '',
    applicableFrom_day: '1',
    applicableFrom_month: currentMonthString,
    applicableFrom_year: currentYearString,
  });
  const [createFeeSelectedClassIds, setCreateFeeSelectedClassIds] = useState<string[]>([]);

  const [showEditFeeModal, setShowEditFeeModal] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeType | null>(null);
  const [editFeeForm, setEditFeeForm] = useState({
    name: '',
    description: '',
    default_amount: '',
    applicableFrom_day: '1',
    applicableFrom_month: currentMonthString,
    applicableFrom_year: currentYearString,
  });
  const [editFeeSelectedClassIds, setEditFeeSelectedClassIds] = useState<string[]>([]);

  const formatFullDate = (day: string, monthIndex: string, year: string): string | null => {
    const d = parseInt(day, 10);
    const m = parseInt(monthIndex, 10);
    const y = parseInt(year, 10);
    if (isNaN(d) || isNaN(m) || isNaN(y) || y < 1900 || y > 2200 || m < 0 || m > 11) return null;
    if (d < 1 || d > daysInMonth(m, y)) return null;
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const resetCreateFeeForm = () => {
    setCreateFeeForm({
      name: '',
      description: '',
      default_amount: '',
      applicableFrom_day: '1',
      applicableFrom_month: currentMonthString,
      applicableFrom_year: currentYearString,
    });
    setCreateFeeSelectedClassIds([]);
    setShowCreateFeeModal(false);
  };

  const resetEditFeeForm = () => {
    setEditFeeForm({
      name: '',
      description: '',
      default_amount: '',
      applicableFrom_day: '1',
      applicableFrom_month: currentMonthString,
      applicableFrom_year: currentYearString,
    });
    setEditFeeSelectedClassIds([]);
    setEditingFee(null);
    setShowEditFeeModal(false);
  };

  const fetchClasses = useCallback(async () => {
    if (!schoolId) { setClasses([]); return; }
    setIsClassesLoading(true);
    const { data, error } = await supabase.from('classes').select('*').eq('school_id', schoolId).order('name', { ascending: true });
    setIsClassesLoading(false);
    if (error) toast.error('Failed to load classes: ' + error.message);
    else setClasses(data || []);
  }, [supabase, schoolId]);

  const fetchFeeTypes = useCallback(async () => {
    if (!schoolId) { setFeeTypes([]); return; }
    setIsFeeTypesLoading(true);
    const { data: feeTypeData, error: feeTypeError } = await supabase
      .from('fee_types')
      .select(`*, fee_type_classes ( class: classes (id, name, school_id) )`)
      .eq('school_id', schoolId).order('name', { ascending: true });
    setIsFeeTypesLoading(false);
    if (feeTypeError) {
      toast.error(`Failed to load fee types: ${feeTypeError.message}`);
      setFeeTypes([]); return;
    }
    const enrichedFeeTypes: FeeType[] = (feeTypeData || []).map((ft) => ({
      ...ft,
      classes: ft.fee_type_classes?.map((link: any) => link.class).filter((cls: any) => cls && cls.school_id === schoolId) || [],
    }));
    setFeeTypes(enrichedFeeTypes);
  }, [supabase, schoolId]);

  useEffect(() => {
    if (user && schoolId && !authLoading && !isSchoolInfoLoading) {
      setIsPageLoading(true);
      Promise.all([fetchClasses(), fetchFeeTypes()]).finally(() => setIsPageLoading(false));
    } else {
      setIsPageLoading(authLoading || isSchoolInfoLoading);
      if (!authLoading && !isSchoolInfoLoading && !schoolId && user) {
        toast.error("School information not available for Fee Management.");
      }
    }
  }, [user, schoolId, authLoading, isSchoolInfoLoading, fetchClasses, fetchFeeTypes]);

  const handleFormInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
    formSetter: React.Dispatch<React.SetStateAction<any>>
  ) => {
    const { name, value } = e.target;
    formSetter((prev: any) => ({ ...prev, [name]: value }));
  };

  const handleSelectAllClasses = ( setFunc: React.Dispatch<React.SetStateAction<string[]>> ) => {
    setFunc(classes.map((c) => c.id));
  };

  const handleUnselectAllClasses = ( setFunc: React.Dispatch<React.SetStateAction<string[]>> ) => {
    setFunc([]);
  };

  const handleCheckboxToggle = ( id: string, currentIds: string[], setFunc: React.Dispatch<React.SetStateAction<string[]>> ) => {
    setFunc( currentIds.includes(id) ? currentIds.filter((cid) => cid !== id) : [...currentIds, id] );
  };

  const validateFeeForm = ( formToValidate: typeof createFeeForm | typeof editFeeForm ): boolean => {
    if (!formToValidate.name.trim()) {
      toast.error('Fee Type Name is required.'); return false;
    }
    if (formToValidate.default_amount && (isNaN(parseFloat(formToValidate.default_amount)) || parseFloat(formToValidate.default_amount) < 0) ) {
      toast.error('Default amount must be a valid non-negative number or empty.'); return false;
    }
    if (formToValidate.applicableFrom_year && parseInt(formToValidate.applicableFrom_year, 10) > 1900 &&
        !formatFullDate(formToValidate.applicableFrom_day, formToValidate.applicableFrom_month, formToValidate.applicableFrom_year)
    ) {
        toast.error("Invalid 'Applicable From' date selected. Please check day, month, and year."); return false;
    }
    return true;
  };

  const handleAddClass = async () => {
    if (!newClassName.trim()) { toast.error('Class name cannot be empty.'); return; }
    if (!schoolId) { toast.error('School information unavailable.'); return; }
    const normalizedNewClassName = newClassName.trim().toLowerCase();
    if (classes.find(c => c.name.toLowerCase() === normalizedNewClassName)) {
      toast.error(`Class "${newClassName.trim()}" already exists. Please choose a different name.`); // Added error message
      return;
    }
    setIsClassesLoading(true);
    const { data: insertedClass, error } = await supabase.from('classes').insert({ name: newClassName.trim(), school_id: schoolId }).select().single();
    setIsClassesLoading(false);
    if (error) toast.error(`Failed to create class: ${error.message}`);
    else if (insertedClass) { toast.success(`Class "${insertedClass.name}" added successfully!`); setNewClassName(''); fetchClasses(); }
  };

  const handleDeleteClass = async (classId: string, className: string) => {
    if (!schoolId) { toast.error("School information not available."); return; }
    const confirmation = window.confirm(`Are you sure you want to delete class "${className}"? This may affect linked fee types and student records.`);
    if (!confirmation) return;
    setIsClassesLoading(true);
    const { error: linkError } = await supabase.from('fee_type_classes').delete().eq('class_id', classId).eq('school_id', schoolId);
    if (linkError) { setIsClassesLoading(false); toast.error(`Failed to remove class links: ${linkError.message}. Class not deleted.`); return; }
    const { error } = await supabase.from('classes').delete().eq('id', classId).eq('school_id', schoolId);
    setIsClassesLoading(false);
    if (error) toast.error(`Failed to delete class "${className}": ${error.message}`);
    else { toast.success(`Class "${className}" deleted.`); fetchClasses(); fetchFeeTypes(); }
  };

  const submitFeeType = async () => {
    if (!validateFeeForm(createFeeForm)) return;
    if (!schoolId) { toast.error('School info unavailable.'); return; }

    const applicableFromDate = (createFeeForm.applicableFrom_year && parseInt(createFeeForm.applicableFrom_year, 10) > 1900)
        ? formatFullDate(createFeeForm.applicableFrom_day, createFeeForm.applicableFrom_month, createFeeForm.applicableFrom_year)
        : null;

    setIsSubmittingFee(true);
    const feeTypePayload: Database['public']['Tables']['fee_types']['Insert'] = {
      name: createFeeForm.name.trim(),
      description: createFeeForm.description.trim() || null,
      default_amount: createFeeForm.default_amount ? parseFloat(createFeeForm.default_amount) : 0,
      school_id: schoolId,
      applicable_from: applicableFromDate,
      applicable_until: null,
      scheduled_date: null,
    };
    const { data: newFeeType, error } = await supabase.from('fee_types').insert(feeTypePayload).select().single();
    if (error || !newFeeType) { setIsSubmittingFee(false); toast.error(`Failed to create fee type: ${error?.message || 'Unknown error'}`); return; }
    if (createFeeSelectedClassIds.length > 0) {
      const linkInsert = createFeeSelectedClassIds.map((class_id) => ({ fee_type_id: newFeeType.id, class_id, school_id: schoolId }));
      const { error: linkError } = await supabase.from('fee_type_classes').insert(linkInsert);
      if (linkError) toast.error(`Failed to link classes: ${linkError.message}`);
    }
    setIsSubmittingFee(false);
    toast.success('Fee type created!');
    fetchFeeTypes();
    resetCreateFeeForm();
  };

  const openEditFeeModal = (feeType: FeeType) => {
    if (feeType.school_id !== schoolId) { toast.error('Unauthorized action.'); return; }
    setEditingFee(feeType);
    let day = '1', month = currentMonthString, year = currentYearString;
    if (feeType.applicable_from) {
        const dateParts = feeType.applicable_from.split('-');
        if (dateParts.length === 3) {
            year = dateParts[0];
            month = String(parseInt(dateParts[1], 10) - 1);
            day = String(parseInt(dateParts[2], 10));
        }
    }
    setEditFeeForm({
      name: feeType.name,
      description: feeType.description ?? '',
      default_amount: feeType.default_amount?.toString() ?? '0',
      applicableFrom_day: day,
      applicableFrom_month: month,
      applicableFrom_year: year,
    });
    setEditFeeSelectedClassIds(feeType.classes?.map((c) => c.id!).filter(Boolean) as string[] || []);
    setShowEditFeeModal(true);
  };

  const handleDuplicateFeeType = (feeType: FeeType) => {
    if (feeType.school_id !== schoolId) { toast.error('Unauthorized action.'); return; }
    let day = '1', month = currentMonthString, year = currentYearString;
    if (feeType.applicable_from) {
        const dateParts = feeType.applicable_from.split('-');
        if (dateParts.length === 3) {
            year = dateParts[0];
            month = String(parseInt(dateParts[1], 10) - 1);
            day = String(parseInt(dateParts[2], 10));
        }
    }
    setCreateFeeForm({
      name: `Copy of ${feeType.name}`,
      description: feeType.description ?? '',
      default_amount: feeType.default_amount?.toString() ?? '0',
      applicableFrom_day: day,
      applicableFrom_month: month,
      applicableFrom_year: year,
    });
    setCreateFeeSelectedClassIds(feeType.classes?.map((c) => c.id!).filter(Boolean) as string[] || []);
    setShowCreateFeeModal(true);
  };

  const updateFeeType = async () => {
    if (!editingFee || !validateFeeForm(editFeeForm) || !schoolId) return;
    if (editingFee.school_id !== schoolId) { toast.error('Unauthorized.'); resetEditFeeForm(); return; }

    const applicableFromDate = (editFeeForm.applicableFrom_year && parseInt(editFeeForm.applicableFrom_year, 10) > 1900)
        ? formatFullDate(editFeeForm.applicableFrom_day, editFeeForm.applicableFrom_month, editFeeForm.applicableFrom_year)
        : null;

    setIsSubmittingFee(true);
    const feeTypeUpdatePayload: Partial<Database['public']['Tables']['fee_types']['Update']> = {
      name: editFeeForm.name.trim(),
      description: editFeeForm.description.trim() || null,
      default_amount: editFeeForm.default_amount ? parseFloat(editFeeForm.default_amount) : 0,
      applicable_from: applicableFromDate,
    };
    const { error: updateError } = await supabase.from('fee_types').update(feeTypeUpdatePayload).eq('id', editingFee.id).eq('school_id', schoolId);
    if (updateError) { setIsSubmittingFee(false); toast.error(`Update failed: ${updateError.message}`); return; }

    await supabase.from('fee_type_classes').delete().eq('fee_type_id', editingFee.id).eq('school_id', schoolId);
    if (editFeeSelectedClassIds.length > 0) {
      const newLinks = editFeeSelectedClassIds.map((class_id) => ({ fee_type_id: editingFee.id, class_id, school_id: schoolId }));
      const { error: insertError } = await supabase.from('fee_type_classes').insert(newLinks);
      if (insertError) { console.error("Error updating class links:", insertError.message); }
    }
    setIsSubmittingFee(false);
    toast.success('Fee type updated!');
    fetchFeeTypes();
    resetEditFeeForm();
  };

  const deleteFeeType = async (feeType: FeeType) => {
    if (!schoolId || feeType.school_id !== schoolId) { toast.error('Unauthorized.'); return; }
    const confirmation = window.prompt(`This action will also remove this fee type from any student fee structures it&apos;s part of. To confirm deletion, type the fee type name:\n"${feeType.name}"`);
    if (confirmation !== feeType.name) { if (confirmation !== null) toast.error('Name did not match. Deletion aborted.'); return; }

    setIsSubmittingFee(true);
    const {error: sftError} = await supabase.from('student_fee_types').delete().eq('fee_type_id', feeType.id).eq('school_id', schoolId);
    if (sftError) { setIsSubmittingFee(false); toast.error(`Failed to dissociate from students: ${sftError.message}`); return; }
    await supabase.from('fee_type_classes').delete().eq('fee_type_id', feeType.id).eq('school_id', schoolId);
    const { error } = await supabase.from('fee_types').delete().eq('id', feeType.id).eq('school_id', schoolId);
    setIsSubmittingFee(false);
    if (error) toast.error(`Failed to delete fee type: ${error.message}`);
    else { toast.success('Fee type deleted.'); fetchFeeTypes(); }
  };

  const isCurrentlyApplicable = (feeType: FeeType): boolean => {
    const now = new Date();
    const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    let isAfterFromOrNoFromDate = true;
    if (feeType.applicable_from) {
        const fromParts = String(feeType.applicable_from).split('-');
        if (fromParts.length === 3) {
            const fromDateUTC = new Date(Date.UTC(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])));
            if (!isNaN(fromDateUTC.getTime())) { isAfterFromOrNoFromDate = todayUTC >= fromDateUTC; }
            else { return false; }
        } else { return false; }
    }
    let isBeforeUntilOrNoUntilDate = true;
    if (feeType.applicable_until) {
        const untilParts = String(feeType.applicable_until).split('-');
        if (untilParts.length === 3) {
            const untilDateUTC = new Date(Date.UTC(parseInt(untilParts[0]), parseInt(untilParts[1]) - 1, parseInt(untilParts[2])));
            if (!isNaN(untilDateUTC.getTime())) { isBeforeUntilOrNoUntilDate = todayUTC <= untilDateUTC; }
            else { return false; }
        } else { return false; }
    }
    return isAfterFromOrNoFromDate && isBeforeUntilOrNoUntilDate;
  };

  const currentYearForPicker = new Date().getFullYear();
  const yearOptions = Array.from({ length: 10 }, (_, i) => currentYearForPicker + i);
  const dayOptions = (monthIndex: number, year: number) => {
    if (isNaN(monthIndex) || isNaN(year)) return [1];
    return Array.from({ length: daysInMonth(monthIndex, year) }, (_, i) => i + 1);
  }

  if (authLoading || isSchoolInfoLoading) {
    return <div className="p-6 text-center animate-pulse text-gray-500">Loading session and school information...</div>;
  }
  if (!user) {
    if (typeof window !== 'undefined') router.replace('/login');
    return <div className="p-6 text-center">Redirecting to login...</div>;
  }
  if (!schoolId) {
    return <div className="p-6 text-center text-red-500 bg-red-50 p-4 rounded-md">School information is not available. Please ensure your account is correctly set up. Fee & Class management features are disabled.</div>;
  }

  return (
    <div className="p-4 sm:p-6 bg-slate-100 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-3">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Fee & Class Management</h1>
        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
            <button
                onClick={() => setShowManageClassesModal(true)}
                disabled={isPageLoading || isClassesLoading}
                className="flex items-center justify-center bg-purple-600 text-white px-4 py-2.5 rounded-lg shadow-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:ring-opacity-75 disabled:bg-gray-300 transition-colors w-full sm:w-auto"
            >
                <CogIcon className="h-5 w-5 mr-2" /> Manage Classes
            </button>
            <button
              onClick={() => setShowCreateFeeModal(true)}
              disabled={isPageLoading || isSubmittingFee}
              className="flex items-center justify-center bg-indigo-600 text-white px-5 py-3 rounded-lg shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-75 disabled:bg-gray-300 transition-all duration-150 ease-in-out transform hover:scale-105 w-full sm:w-auto font-medium"
            >
              <PlusCircleIcon className="h-6 w-6 mr-2"/> Create New Fee Type
            </button>
        </div>
      </div>

      {(isPageLoading || (isFeeTypesLoading && feeTypes.length === 0)) && schoolId && (
        <div className="text-center py-10 text-gray-500 animate-pulse">Loading fee types and classes...</div>
      )}

      {!isPageLoading && !isFeeTypesLoading && feeTypes.length === 0 && schoolId && (
         <div className="text-center py-10 text-gray-500 bg-white p-6 rounded-xl shadow-lg">
             No fee types found for this school. Create one to get started.
         </div>
      )}

      {feeTypes.length > 0 && (
        <div className="overflow-x-auto bg-white shadow-xl rounded-lg">
          <table className="w-full border-collapse min-w-[900px]">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Description</th>
                <th className="p-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Amount (₹)</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Applicable From</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Classes</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th className="p-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {feeTypes.map((fee) => (
                  <tr key={fee.id} className="hover:bg-slate-50 transition-colors">
                    <td className="p-3 whitespace-nowrap text-sm font-medium text-gray-900">{fee.name}</td>
                    <td className="p-3 text-sm text-gray-500 max-w-xs truncate" title={fee.description || undefined}>
                      {fee.description || '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap text-sm text-gray-700 text-right">
                      {fee.default_amount != null ? fee.default_amount.toFixed(2) : '—'}
                    </td>
                    <td className="p-3 whitespace-nowrap text-sm text-gray-700">
                      {fee.applicable_from ? new Date(fee.applicable_from).toLocaleDateString('en-GB', { timeZone: 'UTC' }) : 'Always'}
                    </td>
                    <td className="p-3 text-sm text-gray-700 max-w-xs truncate" title={fee.classes?.map((c) => c?.name).join(', ') || undefined}>
                      {fee.classes && fee.classes.length > 0 ? fee.classes.map((c) => c?.name).join(', ') : <span className="italic text-gray-400">All Classes</span>}
                    </td>
                    <td className="p-3 whitespace-nowrap text-sm">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold ${
                          isCurrentlyApplicable(fee)
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {isCurrentlyApplicable(fee) ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3 whitespace-nowrap text-sm font-medium space-x-1 text-center">
                      <button onClick={() => handleDuplicateFeeType(fee)} disabled={isPageLoading || isSubmittingFee} className="text-sky-600 hover:text-sky-800 p-1 disabled:text-gray-400" title="Duplicate">
                        <DocumentDuplicateIcon className="h-5 w-5"/>
                      </button>
                      <button onClick={() => openEditFeeModal(fee)} disabled={isPageLoading || isSubmittingFee} className="text-indigo-600 hover:text-indigo-800 p-1 disabled:text-gray-400" title="Edit">
                        <PencilSquareIcon className="h-5 w-5"/>
                      </button>
                      <button onClick={() => deleteFeeType(fee)} disabled={isPageLoading || isSubmittingFee} className="text-red-600 hover:text-red-800 p-1 disabled:text-gray-400" title="Delete Fee Type">
                        <TrashIcon className="h-5 w-5"/>
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <Transition appear show={showManageClassesModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={() => setShowManageClassesModal(false)}>
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"><div className="fixed inset-0 bg-black bg-opacity-40" /></Transition.Child>
          <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
          <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
            <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
              <Dialog.Title as="h3" className="text-lg font-semibold leading-6 text-gray-900 flex justify-between items-center">Manage Classes<button onClick={() => setShowManageClassesModal(false)} className="p-1 rounded-full hover:bg-gray-200"><XMarkIcon className="h-5 w-5 text-gray-500"/></button></Dialog.Title>
              <div className="mt-4">
                <div className="flex items-stretch gap-2 mb-4">
                  <input type="text" value={newClassName} onChange={(e) => setNewClassName(e.target.value)} placeholder="New Class Name" disabled={isClassesLoading} className="flex-grow border border-gray-300 rounded-lg px-3 py-2.5 shadow-sm focus:ring-indigo-500 focus:border-indigo-500"/>
                  <button onClick={handleAddClass} disabled={isClassesLoading || !newClassName.trim()} className="bg-green-600 text-white px-5 py-2.5 rounded-lg shadow-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-75 disabled:bg-gray-400 flex items-center justify-center transition-colors duration-150 ease-in-out font-medium">
                    <PlusCircleIcon className="h-5 w-5 mr-2"/> Add
                  </button>
                </div>
                {isClassesLoading && classes.length === 0 && <p className="text-sm text-gray-500">Loading classes...</p>}
                {!isClassesLoading && classes.length === 0 && <p className="text-sm text-gray-500 italic">No classes created yet.</p>}
                {/* NEW TEXT FOR EXISTING CLASSES */}
                {!isClassesLoading && classes.length > 0 && <h4 className="text-sm font-medium text-gray-700 mb-2">Existing Classes:</h4>}
                {classes.length > 0 && (<div className="max-h-60 overflow-y-auto border rounded-md p-2 space-y-1 bg-slate-50">
                    {classes.map(cls => (<div key={cls.id} className="flex justify-between items-center p-1.5 hover:bg-gray-100 group rounded">
                        <span className="text-sm text-gray-700">{cls.name}</span>
                        <button onClick={() => handleDeleteClass(cls.id, cls.name)} disabled={isClassesLoading} className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity" title="Delete Class"><TrashIcon className="h-4 w-4"/></button>
                    </div>))}
                </div>)}
              </div>
              <div className="mt-5 text-right"><button type="button" onClick={() => setShowManageClassesModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2">Done</button></div>
            </Dialog.Panel>
          </Transition.Child></div></div>
        </Dialog>
      </Transition>

      {[
        { show: showCreateFeeModal, form: createFeeForm, setForm: setCreateFeeForm, selectedIds: createFeeSelectedClassIds, setSelectedIds: setCreateFeeSelectedClassIds, reset: resetCreateFeeForm, submit: submitFeeType, title: "Create New Fee Type", submitText: "Create Fee Type", submittingText: "Creating..." },
        { show: showEditFeeModal, form: editFeeForm, setForm: setEditFeeForm, selectedIds: editFeeSelectedClassIds, setSelectedIds: setEditFeeSelectedClassIds, reset: resetEditFeeForm, submit: updateFeeType, title: `Edit Fee Type: ${editingFee?.name || 'N/A'}`, submitText: "Save Changes", submittingText: "Saving..." }
      ].map((modalProps, idx) => (
        modalProps.show && (
          <Transition key={idx} appear show={modalProps.show} as={Fragment}>
            <Dialog as="div" className="relative z-50" onClose={modalProps.reset}>
              <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100" leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"><div className="fixed inset-0 bg-black bg-opacity-40" /></Transition.Child>
              <div className="fixed inset-0 overflow-y-auto"><div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child as={Fragment} enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100" leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95">
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                  <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900 flex justify-between items-center">{modalProps.title}<button onClick={modalProps.reset} className="p-1 rounded-full hover:bg-gray-200"><XMarkIcon className="h-5 w-5 text-gray-500"/></button></Dialog.Title>
                  <form onSubmit={(e) => { e.preventDefault(); modalProps.submit(); }} className="mt-5 space-y-5">
                    <div>
                      <label htmlFor={`${idx}-fee-name`} className="block text-sm font-medium text-gray-700 mb-1">Name <span className="text-red-500">*</span></label>
                      <input id={`${idx}-fee-name`} name="name" value={modalProps.form.name} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"/>
                    </div>
                    <div>
                      <label htmlFor={`${idx}-fee-description`} className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                      <textarea id={`${idx}-fee-description`} name="description" value={modalProps.form.description} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} rows={4} className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"/>
                    </div>
                    <div>
                      <label htmlFor={`${idx}-fee-default_amount`} className="block text-sm font-medium text-gray-700 mb-1">Default Amount (₹)</label>
                      <input id={`${idx}-fee-default_amount`} name="default_amount" value={modalProps.form.default_amount} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} type="number" step="0.01" placeholder="e.g., 500.00" className="mt-1 block w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3"/>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Applicable From (Optional)</label>
                      <div className="grid grid-cols-3 gap-2 mt-1">
                        <select name="applicableFrom_month" value={modalProps.form.applicableFrom_month} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} className="col-span-1 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3">
                          {MONTH_NAMES.map((month, index) => <option key={index} value={String(index)}>{month}</option>)}
                        </select>
                        <select name="applicableFrom_day" value={modalProps.form.applicableFrom_day} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} className="col-span-1 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3">
                          {dayOptions(parseInt(modalProps.form.applicableFrom_month), parseInt(modalProps.form.applicableFrom_year)).map(day => <option key={day} value={String(day)}>{day}</option>)}
                        </select>
                        <select name="applicableFrom_year" value={modalProps.form.applicableFrom_year} onChange={(e) => handleFormInputChange(e, modalProps.setForm)} disabled={isSubmittingFee} className="col-span-1 w-full rounded-lg border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm p-3">
                           {yearOptions.map(year => <option key={year} value={String(year)}>{year}</option>)}
                        </select>
                      </div>
                    </div>
                    <fieldset className="border rounded-md p-3">
                      <legend className="text-sm font-semibold px-1 text-gray-700">Assign to Classes</legend>
                       <div className="my-1 flex space-x-2">
                          <button type="button" onClick={() => handleSelectAllClasses(modalProps.setSelectedIds)} disabled={isSubmittingFee || classes.length === 0} className="text-xs text-indigo-600 hover:underline disabled:text-gray-400">Select All</button>
                          <button type="button" onClick={() => handleUnselectAllClasses(modalProps.setSelectedIds)} disabled={isSubmittingFee} className="text-xs text-indigo-600 hover:underline disabled:text-gray-400">Unselect All</button>
                        </div>
                      <div className="space-y-1 max-h-40 overflow-y-auto border p-2 rounded-md bg-gray-50">
                        {classes.length > 0 ? classes.map((cls) => (
                          <label key={cls.id} className="flex items-center p-1.5 hover:bg-indigo-50 rounded cursor-pointer">
                            <input type="checkbox" checked={modalProps.selectedIds.includes(cls.id)} onChange={() => handleCheckboxToggle(cls.id, modalProps.selectedIds, modalProps.setSelectedIds)} disabled={isSubmittingFee} className="h-4 w-4 text-indigo-600 border-gray-300 rounded focus:ring-offset-0 focus:ring-2 focus:ring-indigo-500 mr-2.5"/>
                            <span className="text-sm text-gray-800">{cls.name}</span>
                          </label>
                        )) : <p className="text-xs text-gray-500 italic">No classes available. Add classes via &quot;Manage Classes&quot;.</p>}
                      </div>
                    </fieldset>
                    <div className="mt-6 flex justify-end space-x-3">
                      <button type="button" onClick={modalProps.reset} disabled={isSubmittingFee} className="px-5 py-2.5 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-200">Cancel</button>
                      <button type="submit" disabled={isSubmittingFee} className="px-5 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-indigo-300">
                        {isSubmittingFee ? modalProps.submittingText : modalProps.submitText}
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child></div></div>
            </Dialog>
          </Transition>
        ))
      )}
    </div>
  );
}