// sfms/app/dashboard/master-ledger/page.tsx
'use client';

import React, { useState, useEffect, useCallback, useRef, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { toast } from 'sonner';
import { Database } from '@/lib/database.types';
import { useAuth } from '@/components/AuthContext';
import html2pdf from 'html2pdf.js';
import { Menu, Transition } from '@headlessui/react'; // Import Menu and Transition
import { ChevronDownIcon, DocumentArrowDownIcon } from '@heroicons/react/20/solid'; // New icons for export

// Types
type Payment = Pick<Database['public']['Tables']['payments']['Row'], 'date' | 'amount_paid' | 'mode_of_payment' | 'receipt_number'>;
type FeeTypeRow = Database['public']['Tables']['fee_types']['Row'];
type StudentFeeTypeRow = Database['public']['Tables']['student_fee_types']['Row'];

type FeeTypeDetail = {
  id: string;
  name: string;
  assigned_amount: number;
  discount: number;
  net_payable: number;
  scheduled_date: string | null;
  applicable_from?: string | null;
  applicable_until?: string | null;
};

type StudentRow = Database['public']['Tables']['students']['Row'];
type ClassRow = Database['public']['Tables']['classes']['Row'];

type StudentWithPayments = StudentRow & {
  classes?: Pick<ClassRow, 'name'> | null;
  payments?: Payment[];
  student_fee_types?: (Pick<StudentFeeTypeRow, 'assigned_amount' | 'discount' | 'discount_description' | 'net_payable_amount'> & {
    fee_type: FeeTypeRow | null;
  })[];
  class_name?: string;
  totalPaid?: number;
  calculated_total_assigned_fees: number;
  calculated_currently_due_fees: number;
  dynamic_status?: 'paid' | 'partially_paid' | 'unpaid' | 'no_fees_due';
  all_fee_details_for_display?: FeeTypeDetail[];
};

type ClassOption = Pick<ClassRow, 'id' | 'name'>;
type FeeView = 'total' | 'due';

export default function MasterLedgerPage() {
  const supabase = createClientComponentClient<Database>();
  const router = useRouter();
  const { user, schoolId, isLoading: authLoading, isSchoolInfoLoading } = useAuth();

  const [view, setView] = useState<'class' | 'school'>('school');
  const [selectedClassId, setSelectedClassId] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [students, setStudents] = useState<StudentWithPayments[]>([]);
  const [classOptions, setClassOptions] = useState<ClassOption[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [feeViewType, setFeeViewType] = useState<FeeView>('total');

  const tableRef = useRef(null); // Ref to the table element for PDF export

  const fetchClasses = useCallback(async () => {
    if (!schoolId) { setClassOptions([]); return; }
    try {
      const { data, error } = await supabase.from('classes').select('id, name')
        .eq('school_id', schoolId).order('name');
      if (error) throw error;
      setClassOptions(data || []);
    } catch (err: any) {
      console.error('Failed to load classes:', err);
      toast.error('Failed to load classes: ' + err.message);
    }
  }, [supabase, schoolId]);

  const fetchStudentsAndDetails = useCallback(async () => {
    if (!schoolId) {
      setStudents([]);
      setPageLoading(false);
      return;
    }
    setPageLoading(true);
    try {
      let query = supabase
        .from('students')
        .select(
          `
          id, name, roll_no, total_fees, status, academic_year, class_id, school_id,
          classes (name),
          payments (date, amount_paid, mode_of_payment, receipt_number),
          student_fee_types (
            assigned_amount, discount, discount_description, net_payable_amount,
            fee_type: fee_types (*)
          )
        `
        )
        .eq('school_id', schoolId);

      if (view === 'class' && selectedClassId) {
        query = query.eq('class_id', selectedClassId);
      }
      query = query.order('name', { ascending: true });

      const { data, error } = await query;
      if (error) throw error;

      const today = new Date();
      const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

      const enrichedStudents: StudentWithPayments[] = (data || []).map(
        (s: any): StudentWithPayments => {
          const totalPaid = s.payments?.reduce((sum: number, p: Payment) => sum + p.amount_paid, 0) || 0;

          let totalAssignedForAllFeeComponents = 0;
          let totalCurrentlyDueAndApplicable = 0;

          const allFeeDetailsDisplay: FeeTypeDetail[] = s.student_fee_types?.map((sft: any) => {
              const feeTypeInfo: FeeTypeRow | null = sft.fee_type;
              const assignedAmount = sft.assigned_amount ?? feeTypeInfo?.default_amount ?? 0;
              const discount = sft.discount || 0;
              const netPayableForThisFee = assignedAmount - discount;

              totalAssignedForAllFeeComponents += netPayableForThisFee;

              let isScheduled = true;
              let isWithinApplicablePeriod = true;

              if (feeTypeInfo) {
                if (feeTypeInfo.scheduled_date) {
                  const scheduledParts = String(feeTypeInfo.scheduled_date).split('-');
                  if (scheduledParts.length === 3) {
                    const scheduledDateUTC = new Date(Date.UTC(parseInt(scheduledParts[0]), parseInt(scheduledParts[1]) - 1, parseInt(scheduledParts[2])));
                    if (!isNaN(scheduledDateUTC.getTime())) {
                      isScheduled = scheduledDateUTC <= todayUTC;
                    } else { isScheduled = false; }
                  } else { isScheduled = false; }
                }

                if (feeTypeInfo.applicable_from) {
                  const fromParts = String(feeTypeInfo.applicable_from).split('-');
                  if (fromParts.length === 3) {
                    const fromDateUTC = new Date(Date.UTC(parseInt(fromParts[0]), parseInt(fromParts[1]) - 1, parseInt(fromParts[2])));
                    if (!isNaN(fromDateUTC.getTime())) {
                      if (todayUTC < fromDateUTC) isWithinApplicablePeriod = false;
                    } else { isWithinApplicablePeriod = false; }
                  } else { isWithinApplicablePeriod = false; }
                }

                if (isWithinApplicablePeriod && feeTypeInfo.applicable_until) {
                  const untilParts = String(feeTypeInfo.applicable_until).split('-');
                  if (untilParts.length === 3) {
                    const untilDateUTC = new Date(Date.UTC(parseInt(untilParts[0]), parseInt(untilParts[1]) - 1, parseInt(untilParts[2])));
                    if (!isNaN(untilDateUTC.getTime())) {
                      if (todayUTC > untilDateUTC) isWithinApplicablePeriod = false;
                    } else { isWithinApplicablePeriod = false; }
                  } else { isWithinApplicablePeriod = false; }
                }

                if (isScheduled && isWithinApplicablePeriod) {
                  totalCurrentlyDueAndApplicable += netPayableForThisFee;
                }
              }

              return {
                id: feeTypeInfo?.id || `sft-${sft.id || Math.random()}`,
                name: feeTypeInfo?.name || 'Unknown Fee Type',
                assigned_amount: assignedAmount,
                discount: discount,
                net_payable: netPayableForThisFee,
                scheduled_date: feeTypeInfo?.scheduled_date || null,
                applicable_from: feeTypeInfo?.applicable_from || null,
                applicable_until: feeTypeInfo?.applicable_until || null,
              };
            }) || [];

          return {
            ...s,
            class_name: s.classes?.name || 'N/A',
            totalPaid,
            calculated_total_assigned_fees: totalAssignedForAllFeeComponents,
            calculated_currently_due_fees: totalCurrentlyDueAndApplicable,
            all_fee_details_for_display: allFeeDetailsDisplay,
          };
        }
      );
      setStudents(enrichedStudents);
    } catch (err: any) {
      console.error('Failed to load students for ledger:', err);
      toast.error(`Failed to load student data: ${err.message || 'Unknown error'}`);
      setStudents([]);
    } finally {
      setPageLoading(false);
    }
  }, [supabase, schoolId, selectedClassId, view]);

  useEffect(() => {
    if (user && schoolId && !authLoading && !isSchoolInfoLoading) {
      fetchClasses();
      fetchStudentsAndDetails();
    } else if (user && !schoolId && !authLoading && !isSchoolInfoLoading) {
      toast.error("School info not loaded. Ledger unavailable.");
      setPageLoading(false);
    } else {
      setPageLoading(authLoading || isSchoolInfoLoading);
    }
  }, [user, schoolId, authLoading, isSchoolInfoLoading, fetchClasses, fetchStudentsAndDetails]);

  useEffect(() => {
    if (user && schoolId && !authLoading && !isSchoolInfoLoading) {
      if (!pageLoading) {
           fetchStudentsAndDetails();
      }
    }
  }, [selectedClassId, view, user, schoolId, authLoading, isSchoolInfoLoading, pageLoading, fetchStudentsAndDetails]);

  const getDynamicStatus = useCallback(
    (student: StudentWithPayments): 'paid' | 'partially_paid' | 'unpaid' | 'no_fees_due' => {
      const feesToConsider = feeViewType === 'total'
        ? student.calculated_total_assigned_fees
        : student.calculated_currently_due_fees;
      const paid = student.totalPaid || 0;

      if (feesToConsider <= 0.009) {
        return paid > 0 ? 'paid' : 'no_fees_due';
      }
      if (paid >= feesToConsider) return 'paid';
      if (paid > 0 && paid < feesToConsider) return 'partially_paid';
      return 'unpaid';
    },
    [feeViewType]
  );

  const filteredStudentsForDisplay = students.filter((stu) => {
    const term = searchTerm.toLowerCase();
    if (!term) return true;
    return (
      stu.name.toLowerCase().includes(term) ||
      (stu.roll_no && stu.roll_no.toLowerCase().includes(term)) ||
      (stu.class_name && stu.class_name.toLowerCase().includes(term))
    );
  });

  const handleExport = (exportType: 'csv' | 'pdf') => {
    if (!filteredStudentsForDisplay.length) {
      toast.error(`No data to export to ${exportType.toUpperCase()}.`); return;
    }

    const filenamePrefix = `master-ledger-${view}-${selectedClassId || 'all'}-${feeViewType}-${new Date().toISOString().split('T')[0]}`;

    if (exportType === 'csv') {
      const header: string[] = [
        "Student Name", "Class", "Roll No",
        feeViewType === 'total' ? "Total Assigned (₹)" : "Total Due (₹)",
        "Total Paid (₹)", "Balance (₹)",
        "Status",
        "Last Payment Date", "Last Payment Amount (₹)", "Last Payment Mode",
        "Academic Year", "Last Receipt #"
      ];

      const rows = filteredStudentsForDisplay.map((stu) => {
        const lastPayment = stu.payments && stu.payments.length > 0 ? stu.payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
        const feesForCalc = feeViewType === 'total' ? stu.calculated_total_assigned_fees : stu.calculated_currently_due_fees;
        const balance = feesForCalc - (stu.totalPaid || 0);
        const currentStatus = getDynamicStatus(stu);
        return [
          stu.name, stu.class_name || 'N/A', stu.roll_no || 'N/A',
          feesForCalc.toFixed(2), (stu.totalPaid || 0).toFixed(2), balance.toFixed(2),
          currentStatus === 'no_fees_due' ? 'No Fees Due' : currentStatus.charAt(0).toUpperCase() + currentStatus.slice(1).replace('_', ' '),
          lastPayment ? new Date(lastPayment.date).toLocaleDateString() : '-',
          lastPayment ? lastPayment.amount_paid.toFixed(2) : '-',
          lastPayment ? lastPayment.mode_of_payment.replace('_', ' ') : '-',
          stu.academic_year || '-',
          lastPayment ? lastPayment.receipt_number || '-' : '-',
        ];
      });
      const csv = [header, ...rows].map(r => r.map(c => (typeof c === 'string' && c.includes(',')) ? `"${c}"` : c).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${filenamePrefix}.csv`;
      document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success('CSV exported successfully!');
    } else if (exportType === 'pdf') {
      if (!tableRef.current) {
        toast.error('Table not found for PDF export.');
        return;
      }

      toast.loading('Generating PDF...');
      const element = tableRef.current;

      // Define PDF options
      const pdfOptions = {
        margin: 10,
        filename: `${filenamePrefix}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, logging: true, dpi: 192, letterRendering: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' }, // Landscape for wider tables
        pagebreak: { mode: ['avoid-all', 'css', 'legacy'] }
      };

      html2pdf().set(pdfOptions).from(element).save()
        .then(() => toast.success('PDF exported successfully!'))
        .catch((err: any) => {
          console.error('PDF export failed:', err);
          toast.error(`PDF export failed: ${err.message || 'Unknown error'}`);
        })
        .finally(() => toast.dismiss()); // Dismiss loading toast
    }
  };

  if (authLoading || (pageLoading && students.length === 0 && !schoolId && !user)) {
    return <div className="p-6 text-center">Loading Master Ledger...</div>;
  }
  if (!user) { return <div className="p-6 text-center">Please log in.</div>; }
  if (!schoolId && !isSchoolInfoLoading) {
    return <div className="p-6 text-center text-red-500">School information unavailable. Master Ledger disabled.</div>;
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-slate-50 min-h-screen">
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-lg">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 mb-6 flex-wrap">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
              value={view}
              onChange={(e) => { setView(e.target.value as 'class' | 'school'); if (e.target.value === 'school') { setSelectedClassId(''); } }}
            >
              <option value="school">School Overview</option>
              <option value="class">Class View</option>
            </select>
            {view === 'class' && (
              <select
                className="p-2.5 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-indigo-500 transition-shadow"
                value={selectedClassId}
                onChange={(e) => setSelectedClassId(e.target.value)}
                disabled={classOptions.length === 0 && !pageLoading}
              >
                <option value="">All Classes in School</option>
                {classOptions.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
              </select>
            )}
            <input
              type="text"
              className="p-2.5 border border-gray-300 rounded-lg shadow-sm w-full md:w-60 focus:ring-2 focus:ring-indigo-500 transition-shadow"
              placeholder="🔍 Search Student/Roll/Class..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg shadow-sm">
              <button onClick={() => setFeeViewType('total')}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${feeViewType === 'total' ? 'bg-indigo-600 text-white shadow' : 'text-gray-700 hover:bg-gray-200'}`}>
                Total Assigned
              </button>
              <button onClick={() => setFeeViewType('due')}
                      className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-colors ${feeViewType === 'due' ? 'bg-indigo-600 text-white shadow' : 'text-gray-700 hover:bg-gray-200'}`}>
                Currently Due
              </button>
            </div>
            {/* Export Button with Dropdown */}
            <Menu as="div" className="relative inline-block text-left">
              <div>
                <Menu.Button
                  className="inline-flex items-center justify-center rounded-lg bg-green-600 px-4 py-2 text-white shadow-md transition-colors hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-opacity-50"
                  disabled={pageLoading || filteredStudentsForDisplay.length === 0}
                >
                  <DocumentArrowDownIcon className="h-5 w-5 mr-2" aria-hidden="true" />
                  Export
                  <ChevronDownIcon className="-mr-1 ml-2 h-5 w-5" aria-hidden="true" />
                </Menu.Button>
              </div>

              <Transition
                as={Fragment}
                enter="transition ease-out duration-100"
                enterFrom="transform opacity-0 scale-95"
                enterTo="transform opacity-100 scale-100"
                leave="transition ease-in duration-75"
                leaveFrom="transform opacity-100 scale-100"
                leaveTo="transform opacity-0 scale-95"
              >
                <Menu.Items className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none">
                  <div className="py-1">
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => handleExport('csv')}
                          className={`${
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                          } block w-full px-4 py-2 text-left text-sm`}
                        >
                          Export as CSV
                        </button>
                      )}
                    </Menu.Item>
                    <Menu.Item>
                      {({ active }) => (
                        <button
                          onClick={() => handleExport('pdf')}
                          className={`${
                            active ? 'bg-gray-100 text-gray-900' : 'text-gray-700'
                          } block w-full px-4 py-2 text-left text-sm`}
                        >
                          Export as PDF
                        </button>
                      )}
                    </Menu.Item>
                  </div>
                </Menu.Items>
              </Transition>
            </Menu>
          </div>
        </div>
      </div>

      {pageLoading && students.length === 0 ? (
        <div className="text-center text-gray-600 py-10 text-lg">Loading student data…</div>
      ) : !pageLoading && filteredStudentsForDisplay.length === 0 && schoolId ? (
        <div className="text-center text-gray-600 py-10 text-lg bg-white p-6 rounded-xl shadow-lg">No records found for the current selection.</div>
      ) : (
        <div ref={tableRef} className="overflow-x-auto bg-white shadow-xl rounded-lg">
          <table className="w-full border-collapse min-w-[900px]">
            <thead className="bg-indigo-700 text-white sticky top-0 z-10">
              <tr>
                <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold uppercase tracking-wider">Student / Class</th>
                <th className="px-3 sm:px-4 py-3 text-right text-xs sm:text-sm font-semibold uppercase tracking-wider">
                  {feeViewType === 'total' ? 'Assigned (₹)' : 'Due (₹)'}
                </th>
                <th className="px-3 sm:px-4 py-3 text-right text-xs sm:text-sm font-semibold uppercase tracking-wider">Paid (₹)</th>
                <th className="px-3 sm:px-4 py-3 text-right text-xs sm:text-sm font-semibold uppercase tracking-wider">Balance (₹)</th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold uppercase tracking-wider">Last Payment</th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold uppercase tracking-wider">Receipt #</th>
                <th className="px-3 sm:px-4 py-3 text-left text-xs sm:text-sm font-semibold uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {view === 'school' && !selectedClassId ? (
                Array.from(new Set(filteredStudentsForDisplay.map((s) => s.class_name)))
                    .sort((a, b) => (a || "").localeCompare(b || ""))
                    .map((className) => {
                      const group = filteredStudentsForDisplay.filter((s) => s.class_name === className);
                      const totalFeesForClass = group.reduce((acc, s) => acc + (feeViewType === 'total' ? s.calculated_total_assigned_fees : s.calculated_currently_due_fees), 0);
                      const totalPaidForClass = group.reduce((acc, s) => acc + (s.totalPaid || 0), 0);
                      const studentsUnpaid = group.filter(s => getDynamicStatus(s) === 'unpaid').length;
                      const studentsPartial = group.filter(s => getDynamicStatus(s) === 'partially_paid').length;
                      const studentsPaid = group.filter(s => getDynamicStatus(s) === 'paid').length;
                      const studentsNoFeesDue = group.filter(s => getDynamicStatus(s) === 'no_fees_due').length;

                      return (
                        <tr key={className || 'unclassified'} className="hover:bg-indigo-50 transition-colors duration-150 group"
                            onClick={() => { setView('class'); const classOpt = classOptions.find(c => c.name === className); if(classOpt) setSelectedClassId(classOpt.id); setSearchTerm(''); }}>
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap cursor-pointer">
                            <div className="font-semibold text-indigo-700 group-hover:underline">{className || 'N/A'}</div>
                            <div className="text-xs text-gray-500">{group.length} student(s)</div>
                          </td>
                          <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap font-medium">{totalFeesForClass.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap text-green-600 font-medium">{totalPaidForClass.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                          <td className={`px-3 sm:px-4 py-3 text-right whitespace-nowrap font-medium ${(totalFeesForClass - totalPaidForClass) > 0.009 ? 'text-red-600' : (totalFeesForClass - totalPaidForClass) < -0.009 ? 'text-blue-600' : 'text-gray-700'}`}>
                            {(totalFeesForClass - totalPaidForClass).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                            {(totalFeesForClass - totalPaidForClass) < -0.009 && <span className="text-xs ml-1">(Adv)</span>}
                          </td>
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">—</td>
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-sm text-gray-500 text-center">—</td>
                          <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs">
                            {studentsUnpaid > 0 && <span className="text-red-500 block">{studentsUnpaid} Unpaid</span>}
                            {studentsPartial > 0 && <span className="text-yellow-500 block">{studentsPartial} Partial</span>}
                            {studentsPaid > 0 && <span className="text-green-500 block">{studentsPaid} Paid</span>}
                            {studentsNoFeesDue > 0 && <span className="text-blue-500 block">{studentsNoFeesDue} No Dues</span>}
                          </td>
                        </tr>
                      );
                    })
              ) : (
                filteredStudentsForDisplay.map((stu) => {
                    const lastPayment = stu.payments && stu.payments.length > 0 ? stu.payments.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] : null;
                    const feesForCalc = feeViewType === 'total' ? stu.calculated_total_assigned_fees : stu.calculated_currently_due_fees;
                    const balance = feesForCalc - (stu.totalPaid || 0);
                    const currentStatus = getDynamicStatus(stu);
                    let statusColor = '', statusText = '';
                    switch (currentStatus) {
                      case 'paid': statusColor = 'bg-green-100 text-green-700'; statusText = 'Paid'; break;
                      case 'partially_paid': statusColor = 'bg-yellow-100 text-yellow-700'; statusText = 'Partial'; break;
                      case 'unpaid': statusColor = 'bg-red-100 text-red-700'; statusText = 'Unpaid'; break;
                      case 'no_fees_due': statusColor = 'bg-blue-100 text-blue-700'; statusText = 'No Dues'; break;
                    }
                    return (
                      <tr key={stu.id} className="hover:bg-indigo-50 transition-colors duration-150 group"
                          onClick={() => router.push(`/dashboard/student/${stu.id}`)}>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap cursor-pointer">
                          <div className="font-medium text-indigo-700 group-hover:underline">{stu.name}</div>
                          <div className="text-xs text-gray-500">{stu.class_name || 'N/A'} • Roll: {stu.roll_no || 'N/A'}</div>
                        </td>
                        <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap">{feesForCalc.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className="px-3 sm:px-4 py-3 text-right whitespace-nowrap text-green-600">{(stu.totalPaid || 0).toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</td>
                        <td className={`px-3 sm:px-4 py-3 text-right whitespace-nowrap font-semibold ${balance < -0.009 ? 'text-blue-600' : balance > 0.009 ? 'text-red-600' : 'text-gray-700'}`}>
                          {balance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                          {balance < -0.009 && <span className="text-xs ml-1">(Adv)</span>}
                        </td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs text-gray-600">{lastPayment ? new Date(lastPayment.date).toLocaleDateString() : '—'}</td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap text-xs text-gray-600">{lastPayment?.receipt_number || '—'}</td>
                        <td className="px-3 sm:px-4 py-3 whitespace-nowrap">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusColor}`}>{statusText}</span>
                        </td>
                      </tr>
                    );
                  })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}