(function() {
    'use strict';
    angular.module('theHiveControllers')
        .controller('CaseTaskDeleteCtrl', CaseTaskDeleteCtrl)
        .controller('CaseTasksCtrl', CaseTasksCtrl);

    function CaseTasksCtrl($scope, $state, $stateParams, $q, $uibModal, FilteringSrv, CaseTabsSrv, PSearchSrv, CaseTaskSrv, UserSrv, NotificationSrv, CortexSrv, AppLayoutSrv) {

        CaseTabsSrv.activateTab($state.current.data.tab);

        $scope.caseId = $stateParams.caseId;
        $scope.state = {
            isNewTask: false,
            showGrouped: !!AppLayoutSrv.layout.groupTasks
        };
        $scope.newTask = {
            status: 'Waiting'
        };
        $scope.taskResponders = null;
        $scope.collapseOptions = {};

        this.$onInit = function() {
            $scope.filtering = new FilteringSrv('case_task', 'task.list', {
                defaults: {
                    showFilters: true,
                    showStats: false,
                    pageSize: 15,
                    sort: ['-flag', '+order', '+startDate', '+title'],
                },
                defaultFilter: []
            });

            $scope.filtering.initContext($scope.caseId)
                .then(function() {
                    $scope.load();

                    $scope.$watchCollection('artifacts.pageSize', function (newValue) {
                        $scope.filtering.setPageSize(newValue);
                    });
                });
        };

        $scope.load = function() {
            $scope.tasks = PSearchSrv($scope.caseId, 'case_task', {
                scope: $scope,
                baseFilter: {
                    _and: [{
                        _parent: {
                            _type: 'case',
                            _query: {
                                '_id': $scope.caseId
                            }
                        }
                    }, {
                        _not: {
                            'status': 'Cancel'
                        }
                    }]
                },
                filter: $scope.filtering.buildQuery(),
                loadAll: true,
                sort: $scope.filtering.context.sort,
                pageSize: $scope.filtering.context.pageSize,
                onUpdate: function() {
                    $scope.buildTaskGroups($scope.tasks.values);
                }
            });
        };

        $scope.toggleStats = function () {
            $scope.filtering.toggleStats();
        };

        $scope.toggleFilters = function () {
            $scope.filtering.toggleFilters();
        };

        $scope.filter = function () {
            $scope.filtering.filter().then($scope.applyFilters);
        };

        $scope.clearFilters = function () {
            $scope.filtering.clearFilters()
                .then($scope.search);
        };

        $scope.removeFilter = function (index) {
            $scope.filtering.removeFilter(index)
                .then($scope.search);
        };

        $scope.search = function () {
            $scope.load();
            $scope.filtering.storeContext();
        };
        $scope.addFilterValue = function (field, value) {
            $scope.filtering.addFilterValue(field, value);
            $scope.search();
        };

        $scope.toggleGroupedView = function() {
            $scope.state.showGrouped = !$scope.state.showGrouped;

            AppLayoutSrv.groupTasks($scope.state.showGrouped);
        };

        $scope.buildTaskGroups = function(tasks) {
            // Sort tasks by order
            var orderedTasks = _.sortBy(_.map(tasks, function(t) {
                return _.pick(t, 'group', 'order');
            }), 'order');
            var groups = [];

            // Get group names by keeping the group orders
            _.each(orderedTasks, function(task) {
                if(groups.indexOf(task.group) === -1) {
                    groups.push(task.group);
                }
            });

            var groupedTasks = [];
            _.each(groups, function(group) {
                groupedTasks.push({
                    group: group,
                    tasks: _.filter(tasks, function(t) {
                        return t.group === group;
                    })
                });
            });

            $scope.groups = groups;
            $scope.groupedTasks = groupedTasks;
        };

        $scope.showTask = function(taskId) {
            $state.go('app.case.tasks-item', {
                itemId: taskId
            });
        };

        $scope.updateField = function (fieldName, newValue, task) {
            var field = {};
            field[fieldName] = newValue;
            return CaseTaskSrv.update({
                taskId: task.id
            }, field, function () {}, function (response) {
                NotificationSrv.error('taskList', response.data, response.status);
            });
        };

        $scope.addTask = function() {
            CaseTaskSrv.save({
                'caseId': $scope.caseId,
                'flag': false
            }, $scope.newTask, function() {
                $scope.isNewTask = false;
                $scope.newTask.title = '';
                $scope.newTask.group = '';
                NotificationSrv.success('Task has been successfully added');
            }, function(response) {
                NotificationSrv.error('taskList', response.data, response.status);
            });
        };

        $scope.removeTask = function(task) {

            var modalInstance = $uibModal.open({
                animation: true,
                templateUrl: 'views/partials/case/case.task.delete.html',
                controller: 'CaseTaskDeleteCtrl',
                controllerAs: 'vm',
                resolve: {
                    title: function() {
                        return task.title;
                    }
                }
            });

            modalInstance.result.then(function() {
                CaseTaskSrv.update({
                    'taskId': task.id
                }, {
                    status: 'Cancel'
                }, function() {
                    $scope.$emit('tasks:task-removed', task);
                    NotificationSrv.success('Task has been successfully removed');
                }, function(response) {
                    NotificationSrv.error('taskList', response.data, response.status);
                });
            });

        };

        // open task tab with its details
        $scope.startTask = function(task) {
            var taskId = task.id;

            if (task.status === 'Waiting') {
                $scope.updateTaskStatus(taskId, 'InProgress')
                    .then(function(/*response*/) {
                        $scope.showTask(taskId);
                    });
            } else {
                $scope.showTask(taskId);
            }
        };

        $scope.openTask = function(task) {
            if (task.status === 'Completed') {
                $scope.updateTaskStatus(task.id, 'InProgress')
                    .then(function(/*response*/) {
                        $scope.showTask(task.id);
                    });
            }
        };

        $scope.closeTask = function(task) {
            if (task.status === 'InProgress') {
                $scope.updateTaskStatus(task.id, 'Completed')
                    .then(function() {
                        NotificationSrv.success('Task has been successfully closed');
                    });
            }
        };

        $scope.updateTaskStatus = function(taskId, status) {
            var defer = $q.defer();

            CaseTaskSrv.update({
                'taskId': taskId
            }, {
                'status': status
            }, function(data) {
                defer.resolve(data);
            }, function(response) {
                NotificationSrv.error('taskList', response.data, response.status);
                defer.reject(response);
            });

            return defer.promise;
        };

        $scope.getTaskResponders = function(taskId, force) {
            if(!force && $scope.taskResponders !== null) {
               return;
            }

            $scope.taskResponders = null;
            CortexSrv.getResponders('case_task', taskId)
              .then(function(responders) {
                  $scope.taskResponders = responders;
              })
              .catch(function(response) {
                  NotificationSrv.error('taskList', response.data, response.status);
              });
        };

        $scope.runResponder = function(responderId, responderName, task) {
            CortexSrv.runResponder(responderId, responderName, 'case_task', _.pick(task, 'id'))
              .then(function(response) {
                  NotificationSrv.success(['Responder', response.data.responderName, 'started successfully on task', task.title].join(' '));
              })
              .catch(function(response) {
                  if(response && !_.isString(response)) {
                      NotificationSrv.error('taskList', response.data, response.status);
                  }
              });
        };
    }

    function CaseTaskDeleteCtrl($uibModalInstance, title) {
        this.title = title;

        this.ok = function() {
            $uibModalInstance.close();
        };

        this.cancel = function() {
            $uibModalInstance.dismiss();
        };
    }
}());
