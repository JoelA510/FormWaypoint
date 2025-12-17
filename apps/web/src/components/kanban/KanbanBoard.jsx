import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useNavigate } from 'react-router-dom';

// Simple API wrapper (assumed existing or using fetch directly here for brevity)
const fetchShipments = async () => {
    const token = localStorage.getItem('token');
    const res = await fetch('http://localhost:3000/shipments?limit=100', {
        headers: { Authorization: `Bearer ${token}` }
    });
    return res.json();
};

const updateShipmentStatus = async (id, status) => {
    const token = localStorage.getItem('token');
    await fetch(`http://localhost:3000/shipments/${id}`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ status })
    });
};

const COLUMNS = {
    draft: { id: 'draft', title: 'Draft' },
    ready_to_book: { id: 'ready_to_book', title: 'Docs Ready' },
    booked: { id: 'booked', title: 'Booked' },
    in_transit: { id: 'in_transit', title: 'In Transit' },
    delivered: { id: 'delivered', title: 'Delivered' },
    exception: { id: 'exception', title: 'Exception' }
};

const KanbanBoard = () => {
    const [columns, setColumns] = useState(COLUMNS);
    const [tasks, setTasks] = useState({}); // Stores shipment data mapped by id
    const [columnOrder, setColumnOrder] = useState([
        'draft',
        'ready_to_book',
        'booked',
        'in_transit',
        'delivered',
        'exception'
    ]);
    const [columnTasks, setColumnTasks] = useState({
        draft: [],
        ready_to_book: [],
        booked: [],
        in_transit: [],
        delivered: [],
        exception: []
    });

    const navigate = useNavigate();

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            const data = await fetchShipments();
            const shipments = data.data || [];

            const newTasks = {};
            const newColumnTasks = {
                draft: [],
                ready_to_book: [],
                booked: [],
                in_transit: [],
                delivered: [],
                exception: []
            };

            shipments.forEach(s => {
                newTasks[s.id] = s;
                // Map backend status to column key (handle robustly)
                const status = s.status || 'draft';
                if (newColumnTasks[status]) {
                    newColumnTasks[status].push(s.id);
                } else {
                    // Fallback or handle unknown status
                    if (!newColumnTasks['draft']) newColumnTasks['draft'] = [];
                    newColumnTasks['draft'].push(s.id);
                }
            });

            setTasks(newTasks);
            setColumnTasks(newColumnTasks);
        } catch (err) {
            console.error('Failed to load shipments', err);
        }
    };

    const onDragEnd = async (result) => {
        const { destination, source, draggableId } = result;

        if (!destination) return;

        if (
            destination.droppableId === source.droppableId &&
            destination.index === source.index
        ) {
            return;
        }

        const startColumnId = source.droppableId;
        const finishColumnId = destination.droppableId;

        if (startColumnId === finishColumnId) {
            // Reordering within same column
            const newIds = Array.from(columnTasks[startColumnId]);
            newIds.splice(source.index, 1);
            newIds.splice(destination.index, 0, draggableId);

            setColumnTasks({
                ...columnTasks,
                [startColumnId]: newIds,
            });
            return;
        }

        // Moving from one column to another
        const startIds = Array.from(columnTasks[startColumnId]);
        startIds.splice(source.index, 1);

        const finishIds = Array.from(columnTasks[finishColumnId]);
        finishIds.splice(destination.index, 0, draggableId);

        setColumnTasks({
            ...columnTasks,
            [startColumnId]: startIds,
            [finishColumnId]: finishIds,
        });

        // Optimistic UI update done, now sync API
        try {
            // Map column ID back to status string (they match generally)
            await updateShipmentStatus(draggableId, finishColumnId);
        } catch (err) {
            console.error('Failed to update status', err);
            // Revert? (Todo: robust error handling)
        }
    };

    return (
        <div className="flex h-full overflow-x-auto p-4 space-x-4 bg-gray-100 min-h-screen">
            <DragDropContext onDragEnd={onDragEnd}>
                {columnOrder.map(columnId => {
                    const column = columns[columnId];
                    const taskIds = columnTasks[columnId] || [];

                    return (
                        <div key={columnId} className="w-80 flex-shrink-0 bg-gray-200 rounded-lg shadow flex flex-col max-h-[80vh]">
                            <div className="p-3 font-bold text-gray-700 bg-gray-300 rounded-t-lg flex justify-between items-center">
                                <span>{column.title}</span>
                                <span className="bg-white px-2 py-0.5 rounded text-sm text-gray-500">{taskIds.length}</span>
                            </div>
                            <Droppable droppableId={columnId}>
                                {(provided, snapshot) => (
                                    <div
                                        ref={provided.innerRef}
                                        {...provided.droppableProps}
                                        className={`flex-1 p-3 overflow-y-auto min-h-[100px] transition-colors ${snapshot.isDraggingOver ? 'bg-blue-50' : ''}`}
                                    >
                                        {taskIds.map((taskId, index) => {
                                            const task = tasks[taskId];
                                            if (!task) return null;
                                            return (
                                                <Draggable key={taskId} draggableId={taskId} index={index}>
                                                    {(provided, snapshot) => (
                                                        <div
                                                            ref={provided.innerRef}
                                                            {...provided.draggableProps}
                                                            {...provided.dragHandleProps}
                                                            onClick={() => navigate(`/shipments/${taskId}`)}
                                                            className={`p-4 mb-3 bg-white rounded shadow cursor-pointer hover:shadow-md border-l-4 ${snapshot.isDragging ? 'shadow-lg rotate-2 scale-105' : ''
                                                                } ${getStatusColor(task.status)}`}
                                                            style={{ ...provided.draggableProps.style }}
                                                        >
                                                            <div className="font-semibold text-gray-800">
                                                                {task.consignee?.name || 'Unknown Consignee'}
                                                            </div>
                                                            <div className="text-xs text-gray-500 mt-1">
                                                                To: {task.destinationCountry}
                                                            </div>
                                                            <div className="flex justify-between items-end mt-3">
                                                                <span className="text-xs font-mono bg-gray-100 px-1 py-0.5 rounded">
                                                                    {formatDate(task.createdAt)}
                                                                </span>
                                                                {task.totalWeightKg && (
                                                                    <span className="text-xs text-gray-600">
                                                                        {task.totalWeightKg}kg
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                </Draggable>
                                            );
                                        })}
                                        {provided.placeholder}
                                    </div>
                                )}
                            </Droppable>
                        </div>
                    );
                })}
            </DragDropContext>
        </div>
    );
};

// Helper utility
const getStatusColor = (status) => {
    switch (status) {
        case 'draft': return 'border-gray-400';
        case 'ready_to_book': return 'border-blue-400';
        case 'booked': return 'border-purple-400';
        case 'in_transit': return 'border-orange-400';
        case 'delivered': return 'border-green-400';
        default: return 'border-gray-300';
    }
}

const formatDate = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toLocaleDateString();
}

export default KanbanBoard;
