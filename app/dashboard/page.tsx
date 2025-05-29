// sfms/app/dashboard/page.tsx
'use client';

import React, { useState, useEffect, useCallback, Fragment } from 'react';
import { useAuth } from '@/components/AuthContext';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { Database } from '@/lib/database.types';
import { toast } from 'sonner';
import {
  UsersIcon,
  BanknotesIcon,
  ReceiptPercentIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  Cog8ToothIcon,
  ClipboardDocumentListIcon,
  ArrowRightCircleIcon,
  XMarkIcon,
  UserPlusIcon,
} from '@heroicons/react/24/outline';
import { Dialog, Transition } from '@headlessui/react';

// Type definitions
type DashboardStats = {
  studentCount: number | null;
  totalAssignedFees: number | null;
  totalCollectedFees: number | null;
  totalOutstandingFees: number | null;
  totalCurrentlyDueFees: number | null; // NEW: Added for dashboard stat
};

// This type is used for the modal data. It needs all these fields.
type StudentFeeDetail = {
  id: string;
  name: string;
  roll_no: string | null;
  class_name: string | null;
  total_fees: number | null;
  paid: number;
  outstanding: number;
  status: string
};

type PaymentDetail = {
  id: string;
  student_name: string | null;
  student_roll_no: string | null;
  amount_paid: number;
  date: string;
  receipt_number: string | null;
  mode_of_payment: string
};

type DetailViewData = StudentFeeDetail[] | PaymentDetail[];
type DetailViewType = 'assigned_fees' | 'collected_fees' | 'outstanding_fees';


interface StatCardProps {
  title: string;
  value: string | number | null;
  icon: React.ReactNode;
  action?: () => void;
  isLoading: boolean;
  colorClass: string;
  subValue?: { label: string; value: number | null; colorClass: string }; // NEW: for sub-value display
}
const StatCard: React.FC<StatCardProps> = ({ title, value, icon, action, isLoading, colorClass, subValue }) => (
  <div
    onClick={action}
    className={`p-5 rounded-xl shadow-lg transition-all duration-300 ease-in-out transform hover:-translate-y-1 bg-white hover:shadow-xl ${action ? 'cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-center justify-between">
      <div className={`p-3 rounded-full ${colorClass}`}>
        {icon}
      </div>
    </div>
    <p className="mt-3 text-sm font-medium text-gray-500 uppercase tracking-wider">{title}</p>
    {isLoading ? (
      <div className="h-8 w-3/4 bg-gray-200 animate-pulse rounded-md mt-1"></div>
    ) : (
      <>
        <p className="mt-1 text-3xl font-semibold text-gray-900">
          {typeof value === 'number' && !title.toLowerCase().includes('students') ? `₹${value.toLocaleString('en-IN')}` : value ?? 'N/A'}
        </p>
        {subValue && subValue.value !== null && (
          <p className={`mt-1 text-xs ${subValue.colorClass} font-medium`}>
            {subValue.label}: ₹{subValue.value.toLocaleString('en-IN')}
          </p>
        )}
      </>
    )}
  </div>
);

interface ActionCardProps {
  title: string;
  href: string;
  icon: React.ReactNode;
  colorTheme: string;
}
const ActionCard: React.FC<ActionCardProps> = ({ title, href, icon, colorTheme }) => (
  <Link href={href} className={`group block p-6 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 ease-in-out transform hover:-translate-y-1 ${colorTheme} text-white`}>
    <div className="flex flex-col items-center text-center">
      <span className="p-3 rounded-full bg-white bg-opacity-20 group-hover:bg-opacity-25 transition-colors mb-3">
        {icon}
      </span>
      <h3 className="text-lg font-semibold">{title}</h3>
    </div>
  </Link>
);

interface DetailModalProps {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  title: string;
  data: DetailViewData | null;
  columns: { Header: string; accessor: string; Cell?: (cell: any) => React.ReactNode }[];
  isLoading: boolean;
}

const DetailModal: React.FC<DetailModalProps> = ({ isOpen, setIsOpen, title, data, columns, isLoading }) => {
  function closeModal() {
    setIsOpen(false);
  }

  return (
    <Transition appear show={isOpen} as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={closeModal}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-200" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black bg-opacity-40" />
        </Transition.Child>
        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4 text-center">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-200" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-3xl transform overflow-hidden rounded-2xl bg-white p-6 text-left align-middle shadow-xl transition-all">
                <Dialog.Title as="h3" className="text-xl font-semibold leading-6 text-gray-900 flex justify-between items-center">
                  {title}
                  <button onClick={closeModal} className="p-1 rounded-full hover:bg-gray-200 transition-colors">
                    <XMarkIcon className="h-6 w-6 text-gray-500" />
                  </button>
                </Dialog.Title>
                <div className="mt-4 max-h-[60vh] overflow-y-auto">
                  {isLoading && <p className="text-center text-gray-500 py-4">Loading details...</p>}
                  {!isLoading && (!data || data.length === 0) && <p className="text-center text-gray-500 py-4">No details to display.</p>}
                  {!isLoading && data && data.length > 0 && (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {columns.map((col) => (
                            <th key={col.accessor} scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {col.Header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {data.map((row: any, rowIndex) => (
                          <tr key={row.id || rowIndex} className="hover:bg-gray-50">
                            {columns.map((col) => (
                              <td key={col.accessor} className="px-4 py-3 whitespace-nowrap text-sm text-gray-700">
                                {col.Cell ? col.Cell(row) : row[col.accessor] ?? 'N/A'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="mt-6 text-right">
                  <button
                    type="button"
                    className="inline-flex justify-center rounded-md border border-transparent bg-indigo-100 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
                    onClick={closeModal}
                  >
                    Close
                  </button>
                </div>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default function DashboardPage() {
  const supabase = createClientComponentClient<Database>();
  const { user, schoolId, isAdmin, isLoading: authLoading, isSchoolInfoLoading } = useAuth();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats>({
    studentCount: null, totalAssignedFees: null, totalCollectedFees: null, totalOutstandingFees: null, totalCurrentlyDueFees: null,
  });
  const [isFetchingPageStats, setIsFetchingPageStats] = useState(true);

  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [detailModalTitle, setDetailModalTitle] = useState('');
  const [detailModalData, setDetailModalData] = useState<DetailViewData | null>(null);
  const [detailModalColumns, setDetailModalColumns] = useState<any[]>([]);
  const [isFetchingDetails, setIsFetchingDetails] = useState(false);

  // Helper function to calculate currently due fees (replicated from Master Ledger / Record Payment)
  const calculateCurrentlyDueFeesForStudent = useCallback((student: any): number => {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    let totalCurrentlyDue = 0;

    student.student_fee_types?.forEach((sft: any) => {
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


  const fetchDashboardAggregates = useCallback(async () => {
    if (!schoolId || !user) {
      setIsFetchingPageStats(false);
      setStats({ studentCount: 0, totalAssignedFees: 0, totalCollectedFees: 0, totalOutstandingFees: 0, totalCurrentlyDueFees: 0 });
      return;
    }
    setIsFetchingPageStats(true);
    try {
      const { count: studentCount, error: studentErr } = await supabase
        .from('students').select('id', { count: 'exact', head: true })
        .eq('school_id', schoolId).eq('status', 'active').eq('is_passed_out', false);
      if (studentErr) console.error("Error fetching student count:", studentErr.message);

      // Fetch all necessary data to calculate totalAssigned, totalCollected, and totalCurrentlyDueFees
      const { data: studentsWithDetails, error: studentsDetailsErr } = await supabase
        .from('students')
        .select(`
          id, total_fees,
          payments(amount_paid),
          student_fee_types(assigned_amount, discount, net_payable_amount, fee_type: fee_types(default_amount, scheduled_date, applicable_from, applicable_until))
        `)
        .eq('school_id', schoolId);

      if (studentsDetailsErr) console.error("Error fetching students and payments for aggregates:", studentsDetailsErr.message);

      let totalAssigned = 0;
      let totalCollected = 0;
      let totalCurrentlyDue = 0;

      if (studentsWithDetails) {
        studentsWithDetails.forEach(student => {
          totalAssigned += student.total_fees || 0;
          student.payments.forEach(payment => {
            totalCollected += payment.amount_paid || 0;
          });
          totalCurrentlyDue += calculateCurrentlyDueFeesForStudent(student); // Calculate for each student
        });
      }

      setStats({
        studentCount: studentCount ?? 0,
        totalAssignedFees: totalAssigned,
        totalCollectedFees: totalCollected,
        totalOutstandingFees: totalAssigned - totalCollected,
        totalCurrentlyDueFees: totalCurrentlyDue, // Set the newly calculated value
      });

    } catch (error: any) {
      toast.error("Failed to load dashboard statistics.");
      console.error("Error fetching dashboard stats:", error.message);
    } finally {
      setIsFetchingPageStats(false);
    }
  }, [supabase, schoolId, user, calculateCurrentlyDueFeesForStudent]);

  useEffect(() => {
    if (user && schoolId && !authLoading && !isSchoolInfoLoading) {
      fetchDashboardAggregates();
    } else if (user && !schoolId && !authLoading && !isSchoolInfoLoading) {
      toast.error("School information not configured for dashboard stats.");
      setIsFetchingPageStats(false);
    } else {
      setIsFetchingPageStats(authLoading || isSchoolInfoLoading);
    }
  }, [user, schoolId, authLoading, isSchoolInfoLoading, fetchDashboardAggregates]);

  const handleShowDetail = async (type: DetailViewType) => {
    if (!schoolId) return;
    setIsFetchingDetails(true);
    setDetailModalData(null);
    setIsDetailModalOpen(true);
    let title = '';
    let columns: any[] = [];
    let fetchedData: DetailViewData = [];

    try {
      if (type === 'assigned_fees') {
        title = 'Total Assigned Fees Breakdown';
        columns = [
          { Header: 'Student Name', accessor: 'name' }, { Header: 'Roll No', accessor: 'roll_no' },
          { Header: 'Class', accessor: 'class_name' },
          { Header: 'Assigned Fees (₹)', accessor: 'total_fees', Cell: (row: StudentFeeDetail) => `₹${row.total_fees?.toLocaleString('en-IN') || '0'}` },
           { Header: 'Status', accessor: 'status', Cell: (row: StudentFeeDetail) => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              row.status === "Paid" ? "bg-green-100 text-green-700"
              : row.status === "Partial" ? "bg-yellow-100 text-yellow-700"
              : row.status === "Unpaid" ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
            }`}>{row.status}</span>
          )},
        ];
        // Ensure payments are fetched to calculate all StudentFeeDetail fields
        const { data, error } = await supabase.from('students')
                                  .select('id, name, roll_no, total_fees, status, classes(name), payments(amount_paid)')
                                  .eq('school_id', schoolId).order('name');
        if (error) throw error;

        fetchedData = data?.map(s => {
          const totalPaid = s.payments?.reduce((sum, p: any) => sum + p.amount_paid, 0) || 0;
          const assignedFees = s.total_fees || 0;
          const outstandingAmount = assignedFees - totalPaid;
          let studentStatus = "Unpaid"; // Base on fetched student.status or recalculate

          // Recalculate dynamic status based on payments for accurate representation
          if (assignedFees <= 0.009) studentStatus = "No Dues";
          else if (totalPaid >= assignedFees) studentStatus = "Paid";
          else if (totalPaid > 0) studentStatus = "Partial";
          else studentStatus = "Unpaid"; // Explicitly set if none of the above

          return {
            id: s.id,
            name: s.name,
            roll_no: s.roll_no,
            class_name: s.classes?.name || 'N/A',
            total_fees: assignedFees,
            paid: totalPaid,
            outstanding: outstandingAmount,
            status: studentStatus // Use the recalculated status
          };
        }) as StudentFeeDetail[] || [];

      } else if (type === 'collected_fees') {
        title = 'Collected Fees Details';
        columns = [
          { Header: 'Student Name', accessor: 'student_name' }, { Header: 'Roll No', accessor: 'student_roll_no' },
          { Header: 'Amount Paid (₹)', accessor: 'amount_paid', Cell: (row: PaymentDetail) => `₹${row.amount_paid.toLocaleString('en-IN')}` },
          { Header: 'Date', accessor: 'date', Cell: (row: PaymentDetail) => new Date(row.date).toLocaleDateString() },
          { Header: 'Receipt #', accessor: 'receipt_number' },
          { Header: 'Mode', accessor: 'mode_of_payment', Cell: (row: PaymentDetail) => row.mode_of_payment.replace('_',' ') },
        ];
        const { data, error } = await supabase.from('payments').select('id, amount_paid, date, receipt_number, mode_of_payment, students(name, roll_no)')
                                  .eq('school_id', schoolId).order('date', { ascending: false });
        if (error) throw error;
        fetchedData = data?.map(p => ({...p, student_name: p.students?.name || "N/A", student_roll_no: p.students?.roll_no || "N/A"} as PaymentDetail)) || [];

      } else if (type === 'outstanding_fees') {
        title = 'Students with Outstanding Fees';
        columns = [
          { Header: 'Student Name', accessor: 'name' }, { Header: 'Roll No', accessor: 'roll_no' },
          { Header: 'Class', accessor: 'class_name' },
          { Header: 'Total Fees (₹)', accessor: 'total_fees', Cell: (row: StudentFeeDetail) => `₹${row.total_fees?.toLocaleString('en-IN') || '0'}` },
          { Header: 'Paid (₹)', accessor: 'paid', Cell: (row: StudentFeeDetail) => `₹${row.paid.toLocaleString('en-IN')}` },
          { Header: 'Outstanding (₹)', accessor: 'outstanding', Cell: (row: StudentFeeDetail) => `₹${row.outstanding.toLocaleString('en-IN')}` },
          { Header: 'Status', accessor: 'status', Cell: (row: StudentFeeDetail) => (
            <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
              row.status === "Paid" ? "bg-green-100 text-green-700"
              : row.status === "Partial" ? "bg-yellow-100 text-yellow-700"
              : row.status === "Unpaid" ? "bg-red-100 text-red-700"
              : "bg-blue-100 text-blue-700"
            }`}>{row.status}</span>
          )},
        ];
        const { data: studentsData, error } = await supabase.from('students')
          .select('id, name, roll_no, total_fees, status, classes(name), payments(amount_paid)')
          .eq('school_id', schoolId).order('name');
        if (error) throw error;

        fetchedData = studentsData?.map(s => {
          const totalPaid = s.payments?.reduce((sum, p: any) => sum + p.amount_paid, 0) || 0;
          const assignedFees = s.total_fees || 0;
          const outstandingAmount = assignedFees - totalPaid;
          let studentStatus = "Unpaid";

          if (assignedFees <= 0.009 ) studentStatus = "No Dues";
          else if (totalPaid >= assignedFees) studentStatus = "Paid";
          else if (totalPaid > 0) studentStatus = "Partial";
          else studentStatus = "Unpaid";

          return {
            id: s.id,
            name: s.name,
            roll_no: s.roll_no,
            class_name: s.classes?.name || 'N/A',
            total_fees: assignedFees,
            paid: totalPaid,
            outstanding: outstandingAmount,
            status: studentStatus
          };
        }).filter(s => s.outstanding > 0.009) as StudentFeeDetail[] || [];
      }
      setDetailModalTitle(title);
      setDetailModalColumns(columns);
      setDetailModalData(fetchedData);
    } catch (error: any) {
      toast.error(`Failed to load details: ${error.message}`);
      setDetailModalData([]);
    } finally {
      setIsFetchingDetails(false);
    }
  };

  if (authLoading || (user && isSchoolInfoLoading && !schoolId && !isAdmin)) {
    return (
      <div className="flex items-center justify-center min-h-screen p-6 bg-slate-50">
        <div className="text-center">
          <svg className="mx-auto h-12 w-12 text-indigo-600 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-gray-600 mt-4 text-lg font-medium">Loading Dashboard...</p>
        </div>
      </div>
    );
  }

  if (!user) { return <div className="p-6 text-center">Redirecting to login...</div>; }

  if (!schoolId && !isSchoolInfoLoading && !isAdmin ) {
     return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 p-6">
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center max-w-md w-full">
          <h2 className="text-2xl font-bold text-red-600 mb-3">School Information Missing</h2>
          <p className="text-gray-600 mb-6">
            Your account needs to be linked to a school to access dashboard features. Please contact support or try logging in again.
          </p>
          <Link href="/login" className="inline-block px-6 py-2.5 bg-indigo-600 text-white font-medium text-sm rounded-lg shadow-md hover:bg-indigo-700 transition-colors">
            Re-Login
          </Link>
        </div>
      </div>
    );
  }

  const displayName = user.user_metadata?.full_name || user.email || (isAdmin ? 'Administrator' : 'User');

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-100 via-gray-100 to-sky-100 selection:bg-purple-100 selection:text-purple-700">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
          <header className="mb-8 md:mb-10">
            <div className="max-w-4xl">
              <h1 className="text-3xl font-extrabold text-gray-900 sm:text-4xl md:text-5xl leading-tight">
                Welcome back, <span className="block text-purple-600 xl:inline">{displayName}!</span>
              </h1>
              <p className="mt-3 text-md text-gray-600 sm:text-lg max-w-2xl">
                Your school&apos;s financial and student overview. Click on stats for details.
              </p>
            </div>
          </header>

          <section className="mb-10 md:mb-12">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <StatCard title="Total Students" value={stats.studentCount}
                        icon={<UsersIcon className="h-7 w-7" />}
                        action={() => router.push('/dashboard/master-ledger')}
                        isLoading={isFetchingPageStats} colorClass="text-purple-600 bg-purple-100" />
              <StatCard title="Total Assigned Fees" value={stats.totalAssignedFees}
                        icon={<BanknotesIcon className="h-7 w-7" />}
                        action={() => handleShowDetail('assigned_fees')}
                        isLoading={isFetchingPageStats}
                        colorClass="text-indigo-600 bg-indigo-100"
                        subValue={{ label: 'Currently Due', value: stats.totalCurrentlyDueFees, colorClass: 'text-gray-500' }} // NEW: Display Currently Due
              />
              <StatCard title="Total Collected Fees" value={stats.totalCollectedFees}
                        icon={<ReceiptPercentIcon className="h-7 w-7" />}
                        action={() => handleShowDetail('collected_fees')}
                        isLoading={isFetchingPageStats} colorClass="text-green-600 bg-green-100" />
              <StatCard title="Total Outstanding Fees" value={stats.totalOutstandingFees}
                        icon={<ExclamationTriangleIcon className="h-7 w-7" />}
                        action={() => handleShowDetail('outstanding_fees')}
                        isLoading={isFetchingPageStats}
                        colorClass="text-red-600 bg-red-100"
                        subValue={{ label: 'Outstanding (Currently Due)', value: (stats.totalCurrentlyDueFees ?? 0) - (stats.totalCollectedFees ?? 0), colorClass: 'text-red-500' }} // NEW: Calculate and display Currently Due Outstanding
              />
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-gray-700 mb-5">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <ActionCard title="Record Payment" href="/dashboard/record-payment"
                          icon={<PencilSquareIcon className="h-7 w-7"/>}
                          colorTheme="bg-gradient-to-br from-teal-500 to-cyan-600"/>
              <ActionCard title="Manage Fees & Classes" href="/dashboard/fee-types"
                          icon={<Cog8ToothIcon className="h-7 w-7"/>}
                          colorTheme="bg-gradient-to-br from-sky-500 to-blue-600"/>
              <ActionCard title="Master Ledger" href="/dashboard/master-ledger"
                          icon={<ClipboardDocumentListIcon className="h-7 w-7"/>}
                          colorTheme="bg-gradient-to-br from-violet-500 to-fuchsia-600"/>
              <ActionCard title="Student Registration" href="/dashboard/student-registration"
                          icon={<UserPlusIcon className="h-7 w-7"/>}
                          colorTheme="bg-gradient-to-br from-pink-500 to-rose-600"/>
            </div>
          </section>

          <footer className="mt-10 pt-6 border-t border-gray-200 text-center">
            <p className="text-xs text-gray-500">
              School Fee Management System &copy; {new Date().getFullYear()}
            </p>
          </footer>
        </div>
      </div>
      <DetailModal
        isOpen={isDetailModalOpen}
        setIsOpen={setIsDetailModalOpen}
        title={detailModalTitle}
        data={detailModalData}
        columns={detailModalColumns}
        isLoading={isFetchingDetails}
      />
    </>
  );
}