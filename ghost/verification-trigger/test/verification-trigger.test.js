// Switch these lines once there are useful utils
// const testUtils = require('./utils');
const sinon = require('sinon');
require('./utils');
const VerificationTrigger = require('../index');
const DomainEvents = require('@tryghost/domain-events');
const {MemberCreatedEvent} = require('@tryghost/member-events');

describe('Import threshold', function () {
    it('Creates a threshold based on config', async function () {
        const trigger = new VerificationTrigger({
            importTriggerThreshold: 2,
            membersStats: {
                getTotalMembers: async () => 1
            }
        });

        const result = await trigger.getImportThreshold();
        result.should.eql(2);
    });

    it('Increases the import threshold to the number of members', async function () {
        const trigger = new VerificationTrigger({
            importTriggerThreshold: 2,
            membersStats: {
                getTotalMembers: async () => 3
            }
        });

        const result = await trigger.getImportThreshold();
        result.should.eql(3);
    });

    it('Does not check members count when config threshold is infinite', async function () {
        const membersStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            importTriggerThreshold: Infinity,
            memberStats: {
                getTotalMembers: membersStub
            }
        });

        const result = await trigger.getImportThreshold();
        result.should.eql(Infinity);
        membersStub.callCount.should.eql(0);
    });
});

describe('Email verification flow', function () {
    it('Triggers verification process', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        result.needsVerification.should.eql(true);
        emailStub.callCount.should.eql(1);
        settingsStub.callCount.should.eql(1);
    });

    it('Does not trigger verification when already verified', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => true,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        result.needsVerification.should.eql(false);
        emailStub.callCount.should.eql(0);
        settingsStub.callCount.should.eql(0);
    });

    it('Does not trigger verification when already in progress', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => true,
            sendVerificationEmail: emailStub
        });

        const result = await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        result.needsVerification.should.eql(false);
        emailStub.callCount.should.eql(0);
        settingsStub.callCount.should.eql(0);
    });

    it('Throws when `throwsOnTrigger` is true', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub
        });

        await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: true
        }).should.be.rejected();
    });

    it('Sends a message containing the number of members imported', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const trigger = new VerificationTrigger({
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub
        });

        await trigger._startVerificationProcess({
            amount: 10,
            throwOnTrigger: false
        });

        emailStub.lastCall.firstArg.should.eql({
            subject: 'Email needs verification',
            message: 'Email verification needed for site: {siteUrl}, has imported: {amountTriggered} members in the last 30 days.',
            amountTriggered: 10
        });
    });

    it('Triggers when a number of API events are dispatched', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().resolves({
            meta: {
                pagination: {
                    total: 10
                }
            }
        });

        new VerificationTrigger({
            apiTriggerThreshold: 2,
            Settings: {
                edit: settingsStub
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub,
            eventRepository: {
                getCreatedEvents: eventStub
            }
        });

        DomainEvents.dispatch(MemberCreatedEvent.create({
            memberId: 'hello!',
            source: 'api'
        }, new Date()));

        eventStub.callCount.should.eql(1);
        eventStub.lastCall.lastArg.should.have.property('source');
        eventStub.lastCall.lastArg.source.should.eql('api');
        eventStub.lastCall.lastArg.should.have.property('created_at');
        eventStub.lastCall.lastArg.created_at.should.have.property('$gt');
        eventStub.lastCall.lastArg.created_at.$gt.should.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
    });

    it('Triggers when a number of members are imported', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().resolves({
            meta: {
                pagination: {
                    total: 10
                }
            }
        });

        const trigger = new VerificationTrigger({
            importTriggerThreshold: 2,
            Settings: {
                edit: settingsStub
            },
            membersStats: {
                getTotalMembers: () => 15
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub,
            eventRepository: {
                getCreatedEvents: eventStub
            }
        });

        await trigger.testImportThreshold();

        eventStub.callCount.should.eql(1);
        eventStub.lastCall.lastArg.should.have.property('source');
        eventStub.lastCall.lastArg.source.should.eql('import');
        eventStub.lastCall.lastArg.should.have.property('created_at');
        eventStub.lastCall.lastArg.created_at.should.have.property('$gt');
        eventStub.lastCall.lastArg.created_at.$gt.should.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        emailStub.callCount.should.eql(1);
        emailStub.lastCall.firstArg.should.eql({
            subject: 'Email needs verification',
            message: 'Email verification needed for site: {siteUrl}, has imported: {amountTriggered} members in the last 30 days.',
            amountTriggered: 10
        });
    });

    it('Triggers when a number of members are added from Admin', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().resolves({
            meta: {
                pagination: {
                    total: 10
                }
            }
        });

        const trigger = new VerificationTrigger({
            adminTriggerThreshold: 2,
            Settings: {
                edit: settingsStub
            },
            membersStats: {
                getTotalMembers: () => 15
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub,
            eventRepository: {
                getCreatedEvents: eventStub
            }
        });

        await trigger._handleMemberCreatedEvent({
            data: {
                source: 'admin'
            }
        });

        eventStub.callCount.should.eql(1);
        eventStub.lastCall.lastArg.should.have.property('source');
        eventStub.lastCall.lastArg.source.should.eql('admin');
        eventStub.lastCall.lastArg.should.have.property('created_at');
        eventStub.lastCall.lastArg.created_at.should.have.property('$gt');
        eventStub.lastCall.lastArg.created_at.$gt.should.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        emailStub.callCount.should.eql(1);
        emailStub.lastCall.firstArg.should.eql({
            subject: 'Email needs verification',
            message: 'Email verification needed for site: {siteUrl} has added: {amountTriggered} members through the Admin client in the last 30 days.',
            amountTriggered: 10
        });
    });
    
    it('Triggers when a number of members are added from API', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().resolves({
            meta: {
                pagination: {
                    total: 10
                }
            }
        });

        const trigger = new VerificationTrigger({
            adminTriggerThreshold: 2,
            apiTriggerThreshold: 2,
            Settings: {
                edit: settingsStub
            },
            membersStats: {
                getTotalMembers: () => 15
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub,
            eventRepository: {
                getCreatedEvents: eventStub
            }
        });

        await trigger._handleMemberCreatedEvent({
            data: {
                source: 'api'
            }
        });

        eventStub.callCount.should.eql(1);
        eventStub.lastCall.lastArg.should.have.property('source');
        eventStub.lastCall.lastArg.source.should.eql('api');
        eventStub.lastCall.lastArg.should.have.property('created_at');
        eventStub.lastCall.lastArg.created_at.should.have.property('$gt');
        eventStub.lastCall.lastArg.created_at.$gt.should.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);

        emailStub.callCount.should.eql(1);
        emailStub.lastCall.firstArg.should.eql({
            subject: 'Email needs verification',
            message: 'Email verification needed for site: {siteUrl} has added: {amountTriggered} members through the API in the last 30 days.',
            amountTriggered: 10
        });
    });

    it('Does not fetch events and trigger when threshold is Infinity', async function () {
        const emailStub = sinon.stub().resolves(null);
        const settingsStub = sinon.stub().resolves(null);
        const eventStub = sinon.stub().resolves({
            meta: {
                pagination: {
                    total: 10
                }
            }
        });

        const trigger = new VerificationTrigger({
            apiTriggerThreshold: Infinity,
            Settings: {
                edit: settingsStub
            },
            membersStats: {
                getTotalMembers: () => 15
            },
            isVerified: () => false,
            isVerificationRequired: () => false,
            sendVerificationEmail: emailStub,
            eventRepository: {
                getCreatedEvents: eventStub
            }
        });

        await trigger.testImportThreshold();

        // We shouldn't be fetching the events if the threshold is Infinity
        eventStub.callCount.should.eql(0);

        // We shouldn't be sending emails if the threshold is Infinity
        emailStub.callCount.should.eql(0);
    });
});
