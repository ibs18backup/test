// app/page.tsx
'use client'; 

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuth } from '@/components/AuthContext';
import { ArrowRightIcon, UserPlusIcon, BuildingLibraryIcon } from '@heroicons/react/24/outline'; // Changed to 24/outline consistent with other files

export default function HomePage() {
  const { user, isLoading, schoolId } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user && schoolId) {
      router.replace('/dashboard');
    }
  }, [user, isLoading, schoolId, router]);

  if (isLoading || (user && !schoolId && !isLoading)) { 
    return (
      <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
        <p className="text-gray-700 animate-pulse">Loading...</p>
      </main>
    );
  }
  
  return (
    <main className="flex flex-col items-center justify-center min-h-screen bg-gray-100 text-gray-800 p-6">
      <div className="text-center max-w-md w-full bg-white p-8 sm:p-10 rounded-xl shadow-xl">
        <BuildingLibraryIcon className="h-16 w-16 text-indigo-500 mx-auto mb-4" /> 
        <h1 className="text-3xl sm:text-4xl font-bold mb-4 text-indigo-700">
          School Fee Manager
        </h1>
        {/* FIXED ESLint error: apostrophe escaped */}
        <p className="text-gray-600 mb-8 text-sm sm:text-base leading-relaxed">
          Streamline your school&apos;s finances. Effortlessly manage fees, track payments,
          and maintain student records with a simple, powerful solution.
        </p>

        <div className="space-y-3">
          <Link
            href="/login"
            className="block w-full px-6 py-3 text-base font-medium text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors flex items-center justify-center"
          >
            Admin Login <ArrowRightIcon className="ml-2 h-5 w-5"/> 
          </Link>
          <Link
            href="/signup"
            className="block w-full px-6 py-3 text-base font-medium text-indigo-700 bg-indigo-100 rounded-lg shadow-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-opacity-50 transition-colors flex items-center justify-center"
          >
            Register New School <UserPlusIcon className="ml-2 h-5 w-5"/> 
          </Link>
        </div>
         <p className="mt-8 text-xs text-gray-400">
          &copy; {new Date().getFullYear()} SFMS.
        </p>
      </div>
    </main>
  );
}