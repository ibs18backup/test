// sfms/app/dashboard/record-payment/page.tsx

'use client';

import React, { useState, useEffect, useCallback, Fragment, ChangeEvent } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { Database } from '@/lib/database.types';
import { useAuth } from '@/components/AuthContext';
import { useRouter } from 'next/navigation';
import { Combobox, Transition, Dialog } from '@headlessui/react';
import { CheckIcon, ChevronUpDownIcon, PlusCircleIcon, XMarkIcon, UserCircleIcon, ClipboardDocumentListIcon } from '@heroicons/react/20/solid';

// Define types for better readability and safety
type ClassType = Pick<Database['public']['Tables']['classes']['Row'], 'id' | 'name'>;
type PaymentType = Database['public']['Tables']['payments']['Row'];
type PaymentInsert = Database['public']['Tables']['payments']['Insert'];
type StudentRow = Database['public']['Tables']['students']['Row'];
type FeeTypeRow = Database['public']['Tables']['fee_types']['Row'];
type StudentFeeTypeRow = Database['public']['Tables']['student_fee_types']['Row'];

// Extended StudentListItem to include fee details for display
type StudentListItem = Pick<StudentRow, 'id' | 'name' | 'roll_no' | 'class_id' | 'school_id' | 'total_fees'> & {
  classes?: { name?: string | null } | null;
  totalAssignedFees?: number;
  currentlyDueFees?: number;
  totalPaidAmount?: number;
  student_fee_types?: (Pick<StudentFeeTypeRow, 'assigned_amount' | 'discount' | 'net_payable_amount'> & {
    fee_type: FeeTypeRow | null;
  })[];
};


export default function RecordPaymentPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const {
    user,
    schoolId,
    isLoading: authLoading,
    isSchoolInfoLoading,
  } = useAuth();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('');
  const [allStudentsInSchool, setAllStudentsInSchool] = useState<StudentListItem[]>([]);
  const [studentPaymentsHistory, setStudentPaymentsHistory] = useState<PaymentType[]>([]); // Added state for student-specific payment history

  const [allSchoolPaymentsHistory, setAllSchoolPaymentsHistory] = useState<
    (PaymentType & { students?: { name: string | null; roll_no: string | null; classes: { name: string | null } | null; } | null })[]
  >([]);

  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);
  const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
  const [isFetchingHistoryAfterSubmit, setIsFetchingHistoryAfterSubmit] = useState(false);

  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedStudentForPayment, setSelectedStudentForPayment] =
    useState<StudentListItem | null>(null);

  const [amountPaid, setAmountPaid] = useState('');
  const [modeOfPayment, setModeOfPayment] = useState('cash');
  const [description, setDescription] = useState('');
  const [manualReceiptNumber, setManualReceiptNumber] = useState('');

  const [classes, setClasses] = useState<ClassType[]>([]);


  // Helper function to calculate currently due fees (similar to Master Ledger)
  const calculateCurrentlyDueFees = useCallback((student: StudentListItem): number => {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let totalCurrentlyDue = 0;

    student.student_fee_types?.forEach(sft => {
      const feeTypeInfo = sft.fee_type;
      const netPayableForThisFee = sft.net_payable_amount ?? sft.assigned_amount ?? (feeTypeInfo?.default_amount || 0);

      let isScheduled = true;
      let isWithinApplicablePeriod = true;

      if (feeTypeInfo) {
        if (feeTypeInfo.scheduled_date) {
          const scheduledParts = String(feeTypeInfo.scheduled_date).split('-');
          const scheduledDateUTC = new Date(Date.UTC(parseInt(scheduledParts[0]), parseInt(scheduledParts[1]) - 1, parseInt(scheduledParts[2])));
          if (isNaN(scheduledDateUTC.getTime()) || scheduledDateUTC > todayUTC) {
            isScheduled = false;
          }
        }
        if (feeTypeInfo.applicable_from) {
          const fromParts = String(feeTypeInfo.applicable_from).split('-');
          const fromDateUTC = new Date(Date.UTC(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])));
          if (isNaN(fromDateUTC.getTime()) || todayUTC < fromDateUTC) {
            isWithinApplicablePeriod = false;
          }
        }
        if (feeTypeInfo.applicable_until) {
          const untilParts = String(feeTypeInfo.applicable_until).split('-');
          const untilDateUTC = new Date(Date.UTC(parseInt(untilParts[0]), parseInt(untilParts[1]) - 1, parseInt(untilParts[2])));
          if (isNaN(untilDateUTC.getTime()) || todayUTC > untilDateUTC) {
            isWithinApplicablePeriod = false;
          }
        }

        if (isScheduled && isWithinApplicablePeriod) {
          totalCurrentlyDue += netPayableForThisFee;
        }
      }
    });
    return totalCurrentlyDue;
  }, []);

  // Moved fetchStudentPaymentHistory definition before useEffect that uses it
  const fetchStudentPaymentHistory = useCallback(async () => {
    if (!selectedStudentForPayment || !selectedStudentForPayment.id || !schoolId) {
      setStudentPaymentsHistory([]);
      return;
    }
    const { data, error } = await supabase
      .from('payments')
      .select('*')
      .eq('student_id', selectedStudentForPayment.id)
      .eq('school_id', schoolId)
      .order('date', { ascending: false });

    if (error) { toast.error('Failed to fetch payment history'); }
    else { setStudentPaymentsHistory(data || []); }
  }, [supabase, schoolId, selectedStudentForPayment]);

  // Memoized function to fetch classes and all students for the Combobox
  const fetchClassesAndStudents = useCallback(async () => {
    if (!schoolId || !user) {
      setClasses([]);
      setAllStudentsInSchool([]);
      return;
    }

    try {
      const [classesRes, studentsRes] = await Promise.all([
        supabase
          .from('classes')
          .select('id, name')
          .eq('school_id', schoolId)
          .order('name'),
        supabase
          .from('students')
          .select(`
            id, name, roll_no, class_id, school_id, total_fees,
            classes(name),
            payments(amount_paid),
            student_fee_types(assigned_amount, discount, net_payable_amount, fee_type: fee_types(*))
          `)
          .eq('school_id', schoolId)
          .order('name'),
      ]);

      if (classesRes.error) {
        toast.error('Failed to load classes: ' + classesRes.error.message);
      } else {
        setClasses(classesRes.data || []);
      }

      if (studentsRes.error) {
        toast.error('Failed to load students: ' + studentsRes.error.message);
      } else {
        const enrichedStudents = (studentsRes.data || []).map(s => {
          const totalPaid = s.payments?.reduce((sum, p: any) => sum + p.amount_paid, 0) || 0;
          const currentlyDue = calculateCurrentlyDueFees(s as StudentListItem);
          return {
            ...s,
            totalAssignedFees: s.total_fees || 0,
            totalPaidAmount: totalPaid,
            currentlyDueFees: currentlyDue,
          } as StudentListItem;
        });
        setAllStudentsInSchool(enrichedStudents);
      }
    } catch (error: any) {
      toast.error('An error occurred while loading student data: ' + error.message);
    }
  }, [supabase, schoolId, user, calculateCurrentlyDueFees]);

  // Memoized function to fetch all payments for the school
  const fetchAllSchoolPaymentsHistory = useCallback(async () => {
    if (!schoolId) {
      setAllSchoolPaymentsHistory([]);
      return;
    }
    setIsFetchingHistoryAfterSubmit(true);
    try {
      const { data, error } = await supabase
        .from('payments')
        .select(`*, students(name, roll_no, classes(name))`)
        .eq('school_id', schoolId)
        .order('date', { ascending: false });

      if (error) {
        toast.error('Failed to fetch all payment history: ' + error.message);
        setAllSchoolPaymentsHistory([]);
      } else {
        setAllSchoolPaymentsHistory(data || []);
      }
    } catch (error: any) {
      toast.error('An error occurred while fetching payment history: ' + error.message);
    } finally {
      setIsFetchingHistoryAfterSubmit(false);
    }
  }, [supabase, schoolId]);

  // Initial data fetch on component mount and auth status changes
  useEffect(() => {
    if (user && schoolId && !authLoading && !isSchoolInfoLoading) {
      setIsLoadingInitialData(true);
      Promise.all([fetchClassesAndStudents(), fetchAllSchoolPaymentsHistory()]).finally(() => {
        setIsLoadingInitialData(false);
      });
    } else {
      setIsLoadingInitialData(authLoading || isSchoolInfoLoading);
    }
  }, [
    user,
    schoolId,
    authLoading,
    isSchoolInfoLoading,
    fetchClassesAndStudents,
    fetchAllSchoolPaymentsHistory,
  ]);

  // Derived state: filtered students for Combobox based on searchTerm and selectedClassFilter
  const filteredStudentsForCombobox = searchTerm === '' && selectedClassFilter === ''
    ? allStudentsInSchool
    : allStudentsInSchool.filter((student) => {
      const matchesSearchTerm = student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.roll_no && student.roll_no.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesClassFilter = selectedClassFilter === '' || student.class_id === selectedClassFilter;
      return matchesSearchTerm && matchesClassFilter;
    });

  const resetPaymentForm = () => {
    setAmountPaid('');
    setModeOfPayment('cash');
    setDescription('');
    setManualReceiptNumber('');
    setSelectedStudentForPayment(null);
    setSearchTerm('');
    setSelectedClassFilter('');
  };

  const closeModal = () => {
    setShowPaymentModal(false);
    resetPaymentForm();
  };

  const handleOpenModal = () => {
    setShowPaymentModal(true);
    resetPaymentForm();
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStudentForPayment || !selectedStudentForPayment.id || !schoolId) {
      toast.error(
        !selectedStudentForPayment
          ? 'Please select a student to record payment.'
          : 'School information is missing.'
      );
      return;
    }
    if (!amountPaid || isNaN(Number(amountPaid)) || Number(amountPaid) <= 0) {
      toast.error('Enter a valid payment amount (must be positive).');
      return;
    }

    const generatedReceiptNumber = manualReceiptNumber.trim()
      ? manualReceiptNumber.trim()
      : `R-${Date.now()}`;
    setIsSubmittingPayment(true);

    const studentName = selectedStudentForPayment.name;
    const studentClassName = selectedStudentForPayment.classes?.name || 'N/A';
    const studentRollNo = selectedStudentForPayment.roll_no || 'N/A';

    const toastId = toast.loading(
      `Recording payment for ${studentName} (Class: ${studentClassName}, Roll No: ${studentRollNo})...`
    );

    const paymentData: PaymentInsert = {
      student_id: selectedStudentForPayment.id,
      school_id: schoolId,
      amount_paid: parseFloat(amountPaid),
      date: new Date().toISOString(),
      mode_of_payment: modeOfPayment,
      description: description.trim() || null,
      receipt_number: generatedReceiptNumber,
    };

    try {
      const { error } = await supabase.from('payments').insert(paymentData);
      if (error) {
        toast.error(`Failed to record payment: ${error.message}`, {
          id: toastId,
        });
      } else {
        toast.success(
          `Payment recorded successfully! Receipt #: ${generatedReceiptNumber}`,
          { id: toastId }
        );
        closeModal();
        fetchAllSchoolPaymentsHistory();
      }
    } catch (err: any) {
      toast.error(
        err.message || 'An unexpected error occurred during payment.',
        { id: toastId }
      );
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // --- Render Logic ---
  if (authLoading || isLoadingInitialData) { // Corrected from isFetchingInitialData
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-gray-500"><div className="animate-pulse">Loading payment module...</div></div>;
  }
  if (!user) {
    if (typeof window !== 'undefined') router.replace('/login');
    return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-gray-500">Redirecting to login...</div>;
  }
  if (!schoolId && !isSchoolInfoLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center text-red-500 bg-red-50 p-6 rounded-lg shadow-md">
          <p className="font-semibold text-lg mb-2">School Information Unavailable</p>
          <p>Please ensure your account is correctly set up. Payment recording features are disabled.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 sm:p-6 bg-slate-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-center mb-8 gap-4">
        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900">Payment Records</h1>
        <button
          onClick={handleOpenModal}
          disabled={isLoadingInitialData}
          className="flex items-center justify-center bg-indigo-600 text-white px-6 py-3 rounded-xl shadow-lg hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:bg-gray-400 transition-all duration-200 ease-in-out transform hover:scale-105 font-semibold text-lg"
        >
          <PlusCircleIcon className="h-6 w-6 mr-2" /> Record New Payment
        </button>
      </div>

      <div className="bg-white p-6 rounded-xl shadow-2xl border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
          <ClipboardDocumentListIcon className="h-7 w-7 text-gray-500 mr-3" /> All School Payments
        </h2>
        {isLoadingInitialData ? (
          <div className="text-center py-10 text-gray-500">
            <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-indigo-600 mx-auto mb-6"></div>
            <p className="text-xl font-medium">Loading all payment records...</p>
          </div>
        ) : isFetchingHistoryAfterSubmit ? (
          <div className="text-center py-10 text-gray-500">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mx-auto mb-4"></div>
            <p className="text-lg font-medium">Refreshing payment history...</p>
          </div>
        ) : allSchoolPaymentsHistory.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <ClipboardDocumentListIcon className="h-20 w-20 text-gray-300 mx-auto mb-6" />
            <p className="text-lg font-medium mb-2">No payment records found yet!</p>
            <p className="text-md text-gray-500">Click the &quot;Record New Payment&quot; button above to get started.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Date</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Student Name</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Class</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Roll No.</th>
                  <th scope="col" className="px-6 py-3 text-right text-xs font-bold text-gray-600 uppercase tracking-wider">Amount (₹)</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Mode</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Receipt #</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {allSchoolPaymentsHistory.map((payment) => (
                  <tr key={payment.id} className="hover:bg-slate-50 transition-colors duration-150">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {new Date(payment.date).toLocaleDateString('en-GB')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {payment.students?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {payment.students?.classes?.name || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                      {payment.students?.roll_no || 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-800 text-right font-semibold">
                      {payment.amount_paid.toFixed(2)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 capitalize">
                      {payment.mode_of_payment.replace(/_/g, ' ')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {payment.receipt_number}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate"
                      title={description ? description : `e.g., Term 1 fees, Admission fees, Fine payment`} // Corrected: Removed .replace calls
                    >
                      {payment.description || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Record Payment Modal */}
      <Transition appear show={showPaymentModal} as={Fragment}>
        <Dialog as="div" className="relative z-50" onClose={closeModal}>
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-black bg-opacity-50" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex min-h-full items-center justify-center p-4 text-center">
              <Transition.Child
                as={Fragment}
                enter="ease-out duration-300"
                enterFrom="opacity-0 scale-95"
                enterTo="opacity-100 scale-100"
                leave="ease-in duration-200"
                leaveFrom="opacity-100 scale-100"
                leaveTo="opacity-0 scale-95"
              >
                <Dialog.Panel className="w-full max-w-lg transform overflow-hidden rounded-3xl bg-white p-8 text-left align-middle shadow-2xl transition-all border border-indigo-100">
                  <Dialog.Title
                    as="h3"
                    className="text-2xl font-bold leading-6 text-gray-900 flex justify-between items-center pb-4 border-b border-gray-200 mb-6"
                  >
                    Record New Payment
                    <button
                      onClick={closeModal}
                      className="p-2 rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                    >
                      <XMarkIcon className="h-6 w-6" />
                    </button>
                  </Dialog.Title>

                  {/* Modal Content - Student Selection vs. Payment Form */}
                  <div className="mt-4">
                    {!selectedStudentForPayment ? (
                      // Step 1: Student Selection
                      <div className="space-y-6">
                        <div className="flex items-center text-indigo-600 text-lg font-semibold mb-4">
                          <UserCircleIcon className="h-7 w-7 mr-3" /> Select a Student
                        </div>
                        <p className="text-gray-700 mb-4">
                          Search for a student by name or roll number, or filter by class.
                        </p>

                        {/* Class Filter Dropdown */}
                        <div className="relative">
                          <label htmlFor="modalClassFilter" className="block text-sm font-medium text-gray-700 mb-1">Filter by Class:</label>
                          <select
                            id="modalClassFilter"
                            className="block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition-all duration-150 ease-in-out"
                            value={selectedClassFilter}
                            onChange={(e) => {
                              setSelectedClassFilter(e.target.value);
                              setSelectedStudentForPayment(null);
                              setSearchTerm('');
                            }}
                            disabled={isLoadingInitialData || classes.length === 0}
                          >
                            <option value="">All Classes</option>
                            {classes.map((cls) => (
                              <option key={cls.id} value={cls.id}>
                                {cls.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Student Searchable Combobox */}
                        <div className="relative mt-4">
                          <label className="block text-sm font-medium text-gray-700 mb-1">Search Student:</label>
                          <Combobox value={selectedStudentForPayment} onChange={setSelectedStudentForPayment} nullable>
                            <div className="relative">
                              <div className="relative w-full cursor-default overflow-hidden rounded-lg bg-white text-left shadow-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all duration-150 ease-in-out border border-gray-300">
                                <Combobox.Input
                                  className="w-full border-none py-3 pl-4 pr-10 text-base leading-5 text-gray-900 focus:ring-0 outline-none"
                                  displayValue={(student: StudentListItem | null) => student?.name || ''}
                                  onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                                  placeholder="Type name or roll no..."
                                  readOnly={isLoadingInitialData && allStudentsInSchool.length === 0}
                                  style={{ opacity: (isLoadingInitialData && allStudentsInSchool.length === 0) ? 0.7 : 1, cursor: (isLoadingInitialData && allStudentsInSchool.length === 0) ? 'not-allowed' : 'auto' }}
                                />
                                <Combobox.Button className="absolute inset-y-0 right-0 flex items-center pr-2">
                                  <ChevronUpDownIcon
                                    className="h-6 w-6 text-gray-400 hover:text-gray-600 transition-colors"
                                    aria-hidden="true"
                                  />
                                </Combobox.Button>
                              </div>
                              <Transition
                                as={Fragment}
                                leave="transition ease-in duration-100"
                                leaveFrom="opacity-100"
                                leaveTo="opacity-0"
                                afterLeave={() => setSearchTerm('')}
                              >
                                <Combobox.Options className="absolute mt-2 max-h-60 w-full overflow-auto rounded-md bg-white py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm z-10">
                                  {isLoadingInitialData ? (
                                    <div className="relative cursor-default select-none py-3 px-4 text-gray-600 text-center flex items-center justify-center">
                                      <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400 mr-3"></div> Loading students...
                                    </div>
                                  ) : filteredStudentsForCombobox.length === 0 && (searchTerm !== '' || selectedClassFilter !== '') ? (
                                    <div className="relative cursor-default select-none py-3 px-4 text-gray-600 italic">
                                      No students found matching your criteria.
                                    </div>
                                  ) : (
                                    filteredStudentsForCombobox.map((student) => (
                                      <Combobox.Option
                                        key={student.id}
                                        className={({ active }) =>
                                          `relative cursor-default select-none py-3 pl-10 pr-4 ${active ? 'bg-indigo-600 text-white' : 'text-gray-900'} transition-colors duration-100`
                                        }
                                        value={student}
                                      >
                                        {({ selected, active }) => (
                                          <>
                                            <span
                                              className={`block truncate ${selected ? 'font-semibold' : 'font-normal'}`}
                                            >
                                              {student.name}
                                              <span className={`${active ? 'text-indigo-200' : 'text-gray-500'} ml-2`}>
                                                (Roll: {student.roll_no} | Class: {student.classes?.name || 'N/A'})
                                              </span>
                                            </span>
                                            {selected ? (
                                              <span
                                                className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-indigo-600'}`}
                                              >
                                                <CheckIcon className="h-5 w-5" aria-hidden="true" />
                                              </span>
                                            ) : null}
                                          </>
                                        )}
                                      </Combobox.Option>
                                    ))
                                  )}
                                </Combobox.Options>
                              </Transition>
                            </div>
                          </Combobox>
                        </div>
                      </div>
                    ) : (
                      // Step 2: Payment Details Form (shown after student selection)
                      <>
                        <h4 className="text-xl font-bold text-indigo-700 mb-6 flex items-center">
                          <PlusCircleIcon className="h-7 w-7 mr-3" />
                          Record Payment for: <span className="font-extrabold ml-2">{selectedStudentForPayment.name}</span>
                        </h4>
                        <p className="text-md text-gray-600 mb-6 border-b border-gray-200 pb-4">
                          Class:{' '}
                          <span className="font-semibold">{selectedStudentForPayment.classes?.name || 'N/A'}</span> | Roll No:{' '}
                          <span className="font-semibold">{selectedStudentForPayment.roll_no || 'N/A'}</span>
                        </p>

                        {/* NEW: Display currently due and total assigned fees */}
                        <div className="grid grid-cols-2 gap-4 mb-6 text-sm">
                          <div>
                            <p className="text-gray-500 font-medium">Total Assigned Fees</p>
                            <p className="text-gray-800 font-semibold">₹{selectedStudentForPayment.totalAssignedFees?.toFixed(2) || '0.00'}</p>
                          </div>
                          <div>
                            <p className="text-gray-500 font-medium">Currently Due</p>
                            <p className="text-red-600 font-semibold">₹{selectedStudentForPayment.currentlyDueFees?.toFixed(2) || '0.00'}</p>
                          </div>
                        </div>

                        <form onSubmit={handleSubmitPayment} className="space-y-5">
                          <div>
                            <label htmlFor="amountPaid" className="block text-sm font-medium text-gray-700 mb-1">
                              Amount (₹) <span className="text-red-500">*</span>
                            </label>
                            <input
                              id="amountPaid"
                              type="number"
                              min="0.01"
                              step="any"
                              value={amountPaid}
                              onChange={(e) => setAmountPaid(e.target.value)}
                              required
                              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150"
                              placeholder="e.g., 1500.00"
                              disabled={isSubmittingPayment}
                            />
                          </div>
                          <div>
                            <label htmlFor="modeOfPayment" className="block text-sm font-medium text-gray-700 mb-1">
                              Mode of Payment
                            </label>
                            <select
                              id="modeOfPayment"
                              value={modeOfPayment}
                              onChange={(e) => setModeOfPayment(e.target.value)}
                              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 bg-white transition-all duration-150"
                              disabled={isSubmittingPayment}
                            >
                              <option value="cash">Cash</option>
                              <option value="upi">UPI</option>
                              <option value="bank_transfer">Bank Transfer</option>
                              <option value="cheque">Cheque</option>
                              <option value="dd">Demand Draft</option>
                              <option value="online_portal">Online Portal</option>
                              <option value="other">Other</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="manualReceiptNumber" className="block text-sm font-medium text-gray-700 mb-1">
                              Receipt Number (Optional)
                            </label>
                            <input
                              id="manualReceiptNumber"
                              type="text"
                              value={manualReceiptNumber}
                              onChange={(e) => setManualReceiptNumber(e.target.value)}
                              placeholder="Auto-generated if blank (e.g., INV-001)"
                              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150"
                              disabled={isSubmittingPayment}
                            />
                          </div>
                          <div>
                            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                              Description/Notes (Optional)
                            </label>
                            <textarea
                              id="description"
                              rows={3}
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="e.g., Term 1 fees, Admission fees, Fine payment"
                              className="mt-1 block w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-indigo-500 focus:border-indigo-500 transition-all duration-150"
                              title={description || `e.g., Term 1 fees, Admission fees, Fine payment`} // Corrected: Removed .replace calls
                              disabled={isSubmittingPayment}
                            />
                          </div>
                          <div className="mt-8 flex justify-end space-x-3">
                            <button
                              type="button"
                              onClick={() => setSelectedStudentForPayment(null)}
                              disabled={isSubmittingPayment}
                              className="px-6 py-2.5 border border-indigo-200 rounded-lg text-base font-medium text-indigo-700 hover:bg-indigo-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-all disabled:bg-gray-200 disabled:text-gray-500"
                            >
                              ← Change Student
                            </button>
                            <button
                              type="submit"
                              disabled={isSubmittingPayment || !selectedStudentForPayment}
                              className={`px-6 py-2.5 rounded-lg text-white text-base font-semibold transition-all duration-150 ease-in-out ${
                                isSubmittingPayment || !selectedStudentForPayment
                                  ? 'bg-gray-400 cursor-not-allowed'
                                  : 'bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500'
                              }`}
                            >
                              {isSubmittingPayment
                                ? `Processing...`
                                : 'Confirm Payment'}
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                  </div>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
}