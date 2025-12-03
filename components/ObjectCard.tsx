/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { Design } from '../types';

interface DesignCardProps {
    design: Design;
    isSelected: boolean;
    onClick?: () => void;
}

const DesignCard: React.FC<DesignCardProps> = ({ design, isSelected, onClick }) => {
    const cardClasses = `
        bg-white rounded-lg shadow-md overflow-hidden transition-all duration-300
        ${onClick ? 'cursor-pointer hover:shadow-xl hover:scale-105' : ''}
        ${isSelected ? 'border-2 border-blue-500 shadow-xl scale-105' : 'border border-zinc-200'}
    `;

    return (
        <div className={cardClasses} onClick={onClick}>
            <div className="aspect-square w-full bg-zinc-100 flex items-center justify-center">
                <img src={design.imageUrl} alt={design.name} className="w-full h-full object-contain" />
            </div>
            <div className="p-3 text-center">
                <h4 className="text-sm font-semibold text-zinc-700 truncate">{design.name}</h4>
            </div>
        </div>
    );
};

export default DesignCard;