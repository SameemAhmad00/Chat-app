import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SkeletonProps {
  className?: string;
}

export const SkeletonBase: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={cn("animate-pulse bg-gray-200 dark:bg-gray-700 rounded-md", className)} />
  );
}

export const SkeletonContact: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={cn("flex items-center p-3 animate-pulse bg-white dark:bg-gray-800 border-b border-gray-100 dark:border-gray-700", className)}>
      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0" />
      <div className="flex-1 ml-4 py-1 space-y-3">
        <div className="h-4 bg-gray-200 dark:bg-gray-600 rounded w-3/4" />
        <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2" />
      </div>
    </div>
  );
};

export const SkeletonStat: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={cn("bg-white dark:bg-gray-800 p-6 rounded-lg shadow-md flex items-center space-x-4 animate-pulse", className)}>
      <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0" />
      <div className="flex-1 space-y-3 py-1">
        <div className="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/2" />
        <div className="h-6 bg-gray-200 dark:bg-gray-600 rounded w-1/3" />
      </div>
    </div>
  );
};

export const SkeletonTableRow: React.FC<{ columns?: number } & SkeletonProps> = ({ columns = 4, className }) => {
  return (
    <tr className={cn("animate-pulse border-b border-gray-200 dark:border-gray-700", className)}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="p-3">
          <div className="flex items-center space-x-3">
            {i === 0 && <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0" />}
            <div className={cn("h-4 bg-gray-200 dark:bg-gray-600 rounded", i === 0 ? "w-32" : (i === columns - 1 ? "w-20 mx-auto" : "w-24"))} />
          </div>
        </td>
      ))}
    </tr>
  );
};

export const SkeletonMessage: React.FC<{ isOwn?: boolean } & SkeletonProps> = ({ isOwn = false, className }) => {
  return (
    <div className={cn("flex w-full mb-4 animate-pulse", isOwn ? "justify-end" : "justify-start", className)}>
      {!isOwn && <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-600 shrink-0 mr-2 mt-auto" />}
      <div className={cn("rounded-2xl p-3 max-w-[70%]", isOwn ? "bg-green-100 dark:bg-green-900/30 rounded-br-none" : "bg-white dark:bg-gray-800 rounded-bl-none shadow-sm")}>
        <div className={cn("h-4 bg-gray-300 dark:bg-gray-600 rounded mb-2", isOwn ? "bg-green-200 dark:bg-green-800/50" : "bg-gray-200 dark:bg-gray-600", "w-48")} />
        <div className={cn("h-3 rounded w-32", isOwn ? "bg-green-200 dark:bg-green-800/50" : "bg-gray-200 dark:bg-gray-600")} />
      </div>
    </div>
  );
};
